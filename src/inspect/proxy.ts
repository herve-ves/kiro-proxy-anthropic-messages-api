// MITM Proxy Server
// Handles HTTP CONNECT tunneling with selective TLS interception

import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import { getDomainCert } from './cert'
import { logCapture } from './logger'

// Domains to intercept (MITM)
const TARGET_PATTERNS = [
  /^q[-.].*\.amazonaws\.com$/,
  /^.*\.auth\.desktop\.kiro\.dev$/,
  /^oidc\..*\.amazonaws\.com$/,
]

function isTargetDomain(hostname: string): boolean {
  return TARGET_PATTERNS.some((re) => re.test(hostname))
}

const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const red = (s: string) => `\x1b[31m${s}\x1b[0m`
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`

/**
 * Start the MITM proxy server.
 */
export function startProxy(port: number): http.Server {
  const server = http.createServer(handleHttpRequest)

  // Handle HTTPS CONNECT tunneling
  server.on('connect', handleConnect)

  server.listen(port, () => {
    console.log(cyan(`MITM proxy listening on port ${port}`))
  })

  return server
}

/**
 * Handle plain HTTP requests (non-CONNECT).
 */
function handleHttpRequest(clientReq: http.IncomingMessage, clientRes: http.ServerResponse) {
  const url = clientReq.url || '/'
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    clientRes.writeHead(400)
    clientRes.end('Bad Request')
    return
  }

  const hostname = parsedUrl.hostname
  const reqPort = Number(parsedUrl.port) || 80

  console.log(dim(`HTTP ${clientReq.method} ${hostname}${parsedUrl.pathname}`))

  const options: http.RequestOptions = {
    hostname,
    port: reqPort,
    path: parsedUrl.pathname + parsedUrl.search,
    method: clientReq.method,
    headers: { ...clientReq.headers, host: hostname },
  }

  const proxyReq = http.request(options, (proxyRes) => {
    clientRes.writeHead(proxyRes.statusCode || 502, proxyRes.headers)
    proxyRes.pipe(clientRes)
  })

  proxyReq.on('error', (err) => {
    console.error(red(`HTTP proxy error for ${hostname}: ${err.message}`))
    if (!clientRes.headersSent) {
      clientRes.writeHead(502)
    }
    clientRes.end('Bad Gateway')
  })

  clientReq.pipe(proxyReq)
}

/**
 * Handle CONNECT requests for HTTPS tunneling.
 */
function handleConnect(req: http.IncomingMessage, clientSocket: net.Socket, head: Buffer) {
  const [hostname, portStr] = (req.url || '').split(':')
  const port = Number(portStr) || 443

  clientSocket.on('error', (err) => {
    console.error(red(`Client socket error for ${hostname}: ${err.message}`))
  })

  if (!isTargetDomain(hostname)) {
    console.log(dim(`TUNNEL ${hostname}:${port} (passthrough)`))
    tunnelPassthrough(hostname, port, clientSocket, head)
    return
  }

  console.log(cyan(`INTERCEPT ${hostname}:${port}`))
  mitmIntercept(hostname, port, clientSocket, head)
}

/**
 * Transparent TCP tunnel (no interception).
 */
function tunnelPassthrough(hostname: string, port: number, clientSocket: net.Socket, head: Buffer) {
  const serverSocket = net.connect(port, hostname, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')
    if (head.length > 0) serverSocket.write(head)
    serverSocket.pipe(clientSocket)
    clientSocket.pipe(serverSocket)
  })

  serverSocket.on('error', (err) => {
    console.error(red(`Passthrough error for ${hostname}:${port}: ${err.message}`))
    clientSocket.destroy()
  })
  clientSocket.on('error', () => serverSocket.destroy())
  clientSocket.on('close', () => serverSocket.destroy())
  serverSocket.on('close', () => clientSocket.destroy())
}

/**
 * MITM intercept using a local TLS server on a random port.
 * This avoids issues with tls.TLSSocket wrapping in Bun.
 */
function mitmIntercept(hostname: string, port: number, clientSocket: net.Socket, head: Buffer) {
  const { cert, key } = getDomainCert(hostname)

  // Create a one-shot local HTTPS server for this connection
  const localServer = https.createServer({ cert, key }, (req, res) => {
    const fullUrl = `https://${hostname}${req.url || '/'}`
    console.log(cyan(`  -> ${req.method} ${fullUrl}`))

    // Collect request body
    const reqChunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => reqChunks.push(chunk))
    req.on('end', () => {
      const reqBody = Buffer.concat(reqChunks)
      const reqBodyStr = reqBody.length > 0 ? reqBody.toString('utf-8') : undefined

      // Build headers for the real request
      const forwardHeaders: Record<string, string | string[]> = {}
      for (const [k, v] of Object.entries(req.headers)) {
        if (v && !k.startsWith('proxy-')) {
          forwardHeaders[k] = v
        }
      }
      forwardHeaders['host'] = hostname

      // Forward to real server
      const options: https.RequestOptions = {
        hostname,
        port,
        path: req.url,
        method: req.method,
        headers: forwardHeaders,
      }

      const proxyReq = https.request(options, (proxyRes) => {
        const resChunks: Buffer[] = []

        const resHeaders: Record<string, string> = {}
        for (const [k, v] of Object.entries(proxyRes.headers)) {
          if (v) {
            resHeaders[k] = Array.isArray(v) ? v.join(', ') : v
          }
        }
        res.writeHead(proxyRes.statusCode || 502, proxyRes.headers)

        proxyRes.on('data', (chunk: Buffer) => {
          resChunks.push(chunk)
          res.write(chunk)
        })

        proxyRes.on('end', () => {
          res.end()

          logCapture(
            {
              method: req.method || 'GET',
              url: fullUrl,
              headers: flattenHeaders(req.headers),
              body: reqBodyStr,
            },
            {
              statusCode: proxyRes.statusCode || 0,
              headers: resHeaders,
              body: Buffer.concat(resChunks),
            },
          )
        })
      })

      proxyReq.on('error', (err) => {
        console.error(red(`Error forwarding to ${hostname}: ${err.message}`))
        if (!res.headersSent) {
          res.writeHead(502)
        }
        res.end('Bad Gateway')
      })

      if (reqBody.length > 0) {
        proxyReq.write(reqBody)
      }
      proxyReq.end()
    })
  })

  localServer.on('tlsClientError', (err) => {
    console.error(red(`TLS client error for ${hostname}: ${err.message}`))
  })

  // Listen on a random port, then tunnel the client socket to it
  localServer.listen(0, '127.0.0.1', () => {
    const addr = localServer.address()
    if (!addr || typeof addr === 'string') {
      clientSocket.destroy()
      localServer.close()
      return
    }

    const localPort = addr.port

    // Tell client the CONNECT tunnel is established
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n')

    // Connect to our local TLS server and pipe the client through
    const localSocket = net.connect(localPort, '127.0.0.1', () => {
      if (head.length > 0) localSocket.write(head)
      clientSocket.pipe(localSocket)
      localSocket.pipe(clientSocket)
    })

    localSocket.on('error', (err) => {
      console.error(red(`Local socket error for ${hostname}: ${err.message}`))
      clientSocket.destroy()
    })

    clientSocket.on('error', () => localSocket.destroy())

    // Clean up: close the local server when the connection ends
    const cleanup = () => {
      localServer.close()
    }
    clientSocket.on('close', cleanup)
    localSocket.on('close', cleanup)
  })
}

function flattenHeaders(headers: http.IncomingHttpHeaders): Record<string, string> {
  const flat: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    if (v) flat[k] = Array.isArray(v) ? v.join(', ') : v
  }
  return flat
}
