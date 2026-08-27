/**
 * A random v4 UUID that also works on a plain-HTTP LAN origin.
 *
 * **`crypto.randomUUID()` is `[SecureContext]`.** It exists on `localhost`
 * and over HTTPS, and is `undefined` on `http://<nas-ip>:8084` — which is
 * exactly how this app is deployed (`docs/deploy-synology.md`: LAN-only HTTP
 * to start). Calling it there throws a `TypeError` *inside the event handler
 * that asked for an id*, so React never re-renders and the click looks like
 * it simply did nothing. That is what broke "add to timeline", "start
 * tracking", pomodoro phase records and saved filter presets on the NAS while
 * every one of them worked in dev, where `localhost` is a secure context.
 *
 * `crypto.getRandomValues()` is deliberately *not* secure-context gated, so
 * the fallback is a genuine CSPRNG-backed UUID rather than a weaker id. The
 * `Math.random` branch below it is a last resort for a JS environment with no
 * `crypto` global at all; ids here are local record keys, never secrets, so
 * degrading is better than throwing.
 *
 * **Never call `crypto.randomUUID()` directly** — use this. Every id in the
 * app-local layer (timeline placements, time entries, pomodoro phases, filter
 * presets) is minted through here so the failure can't come back one call
 * site at a time.
 */
export function randomId(): string {
  const webCrypto: Crypto | undefined = globalThis.crypto

  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID()

  const bytes = new Uint8Array(16)
  if (typeof webCrypto?.getRandomValues === 'function') {
    webCrypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }

  // RFC 4122 §4.4: pin the version (4) and variant (10xx) bits so the result
  // is a well-formed v4 UUID and not merely 32 random hex characters.
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80

  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
