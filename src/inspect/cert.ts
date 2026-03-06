// MITM CA Certificate Generation and Per-Domain Signing
// Uses node-forge for pure JS RSA key generation and X.509 certificate creation

import forge from 'node-forge'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

const CA_DIR = join(homedir(), '.kiro-proxy', 'mitm-ca')
const CA_CERT_PATH = join(CA_DIR, 'ca.pem')
const CA_KEY_PATH = join(CA_DIR, 'ca-key.pem')

interface CertKeyPair {
  cert: string
  key: string
}

// In-memory cache for generated domain certs
const domainCertCache = new Map<string, CertKeyPair>()

let caCert: forge.pki.Certificate | null = null
let caKey: forge.pki.rsa.PrivateKey | null = null

/**
 * Initialize or load the root CA certificate.
 * Returns the path to the CA cert file.
 */
export function initCA(): string {
  if (existsSync(CA_CERT_PATH) && existsSync(CA_KEY_PATH)) {
    // Load existing CA
    const certPem = readFileSync(CA_CERT_PATH, 'utf-8')
    const keyPem = readFileSync(CA_KEY_PATH, 'utf-8')
    caCert = forge.pki.certificateFromPem(certPem)
    caKey = forge.pki.privateKeyFromPem(keyPem)
    return CA_CERT_PATH
  }

  // Generate new CA
  mkdirSync(CA_DIR, { recursive: true })

  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()

  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 10)

  const attrs = [
    { name: 'commonName', value: 'Kiro Proxy MITM CA' },
    { name: 'organizationName', value: 'kiro-proxy' },
  ]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)

  cert.setExtensions([
    { name: 'basicConstraints', cA: true },
    { name: 'keyUsage', keyCertSign: true, cRLSign: true },
  ])

  cert.sign(keys.privateKey, forge.md.sha256.create())

  const certPem = forge.pki.certificateToPem(cert)
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey)

  writeFileSync(CA_CERT_PATH, certPem)
  writeFileSync(CA_KEY_PATH, keyPem)

  caCert = cert
  caKey = keys.privateKey

  return CA_CERT_PATH
}

/**
 * Generate a TLS certificate for a specific domain, signed by our CA.
 */
export function getDomainCert(domain: string): CertKeyPair {
  const cached = domainCertCache.get(domain)
  if (cached) return cached

  if (!caCert || !caKey) {
    throw new Error('CA not initialized. Call initCA() first.')
  }

  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()

  cert.publicKey = keys.publicKey
  cert.serialNumber = Date.now().toString(16)
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notAfter.getFullYear() + 1)

  cert.setSubject([{ name: 'commonName', value: domain }])
  cert.setIssuer(caCert.subject.attributes)

  cert.setExtensions([
    { name: 'subjectAltName', altNames: [{ type: 2, value: domain }] },
  ])

  cert.sign(caKey, forge.md.sha256.create())

  const pair: CertKeyPair = {
    cert: forge.pki.certificateToPem(cert),
    key: forge.pki.privateKeyToPem(keys.privateKey),
  }

  domainCertCache.set(domain, pair)
  return pair
}

export function getCACertPath(): string {
  return CA_CERT_PATH
}
