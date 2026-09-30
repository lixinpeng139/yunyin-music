/**
 * Client-side session identity.
 *
 * The session cookie itself is **not** stored here.
 *
 * The app runs from a `tauri://` origin while the API bridge is on
 * `http://127.0.0.1`, and WebKit treats `Cookie` as a forbidden request header
 * there: it accepts the `setRequestHeader` call and then drops the header, so
 * the bridge always saw an empty cookie and every authenticated call failed.
 * Verified by comparing the same code on an `http://` origin (header sent, 881
 * bytes, `MUSIC_U` present) with the packaged app (header absent, 0 bytes).
 *
 * Instead the bridge keeps the cookie jar server-side and the renderer only
 * holds an opaque id for it — no cookie ever crosses the webview boundary.
 */

const STORAGE_KEY = 'yunyin.client.v1'

let clientId = ''

/** Stable, per-install identifier used to find our jar in the bridge. */
export function getClientId(): string {
  if (clientId) return clientId
  try {
    const existing = localStorage.getItem(STORAGE_KEY)
    if (existing) {
      clientId = existing
      return clientId
    }
  } catch {
    /* storage unavailable; fall through to an in-memory id */
  }
  const generated =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `c-${Date.now()}-${Math.random().toString(36).slice(2)}`
  clientId = generated
  try {
    localStorage.setItem(STORAGE_KEY, generated)
  } catch {
    /* the id simply will not survive a restart */
  }
  return clientId
}

/**
 * Last answer from the bridge.
 *
 * Kept only for synchronous callers; `hasSession()` is authoritative and always
 * re-asks, because a cached "signed in" would survive an expired session.
 */
let sessionPresent = false

export function setSessionPresent(present: boolean) {
  sessionPresent = present
}

/** Synchronous peek at the last known state. */
export function sessionPresentCached(): boolean {
  return sessionPresent
}

/**
 * Whether the bridge holds a usable session.
 *
 * The authoritative state lives in the bridge's jar, so this asks it rather
 * than trusting a local flag — an expired session must not look signed-in.
 */
export async function hasSession(): Promise<boolean> {
  const { refreshSessionState } = await import("./client");
  return refreshSessionState();
}

/** Drops the local view of the session; the bridge clears its jar on logout. */
export function clearSession() {
  sessionPresent = false
}

export { clearSession as clearJar }
