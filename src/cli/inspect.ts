// CLI: inspect subcommand
// Launch MITM proxy to capture and decode Kiro API traffic

import { initCA, getCACertPath } from '../inspect/cert'
import { setOutputDir } from '../inspect/logger'
import { startProxy } from '../inspect/proxy'

interface InspectOptions {
  port: string
  output: string
}

export async function runInspectCommand(options: InspectOptions) {
  const port = Number(options.port)
  const outputDir = options.output

  console.log('')
  console.log('\x1b[1m\x1b[36mKiro API Inspector — MITM Proxy\x1b[0m')
  console.log('')

  // Initialize CA certificate
  console.log('Initializing CA certificate...')
  const caPath = initCA()
  console.log(`CA certificate: \x1b[32m${caPath}\x1b[0m`)

  // Set output directory for captures
  setOutputDir(outputDir)
  console.log(`Capture output: \x1b[32m${outputDir}/\x1b[0m`)
  console.log('')

  // Print CA trust instructions
  console.log('\x1b[33mFirst-time setup — trust the CA certificate:\x1b[0m')
  console.log('')
  console.log('  macOS:')
  console.log(`    sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ${getCACertPath()}`)
  console.log('')
  console.log('  Linux (Ubuntu/Debian):')
  console.log(`    sudo cp ${getCACertPath()} /usr/local/share/ca-certificates/kiro-proxy-mitm.crt`)
  console.log('    sudo update-ca-certificates')
  console.log('')

  // Print proxy usage instructions
  console.log('\x1b[33mLaunch Kiro IDE with the proxy:\x1b[0m')
  console.log('')
  console.log(`  HTTP_PROXY=http://localhost:${port} HTTPS_PROXY=http://localhost:${port} /path/to/kiro`)
  console.log('')
  console.log('  Or set in Kiro IDE settings:')
  console.log(`    "http.proxy": "http://localhost:${port}"`)
  console.log('')

  // Print intercepted domains
  console.log('\x1b[36mIntercepted domains:\x1b[0m')
  console.log('  q.*.amazonaws.com')
  console.log('  *.auth.desktop.kiro.dev')
  console.log('  oidc.*.amazonaws.com')
  console.log('')
  console.log('All other HTTPS traffic is tunneled through without interception.')
  console.log('')

  // Start the proxy
  startProxy(port)
}
