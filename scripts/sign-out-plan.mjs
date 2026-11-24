/**
 * Sign-out / pre-sign-in sequencing, kept dependency-free so it can be unit
 * tested without a browser.
 *
 * The two environments behave differently:
 *   - live preview (embedded iframe, bearer token auth): clearing the local
 *     token is enough, but the server call must never hang the UI, so it is
 *     bounded by `timeoutMs`.
 *   - deployed (HttpOnly cookie auth): only the server can end the session, so
 *     a failed or hanging server call must surface as a rejection instead of
 *     reporting a sign-out that did not happen.
 */

const DEFAULT_PRE_SIGN_IN_TIMEOUT_MS = 1_500;
const DEFAULT_SIGN_OUT_TIMEOUT_MS = 10_000;

/**
 * @template T
 * @param {Promise<T> | T | undefined} promise
 * @param {number} ms
 * @returns {Promise<T | undefined>}
 */
function withTimeout(promise, ms) {
  if (!ms || ms <= 0) return Promise.resolve(promise);
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("Timed out"));
    }, ms);
    Promise.resolve(promise).then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * @typedef {object} SignOutDeps
 * @property {boolean} livePreview
 * @property {boolean} [hasBearer]
 * @property {() => Promise<unknown> | unknown} [requestSignOut]
 * @property {() => void} [clearToken]
 * @property {() => void} [redirect]
 */

/**
 * Clear any prior identity before starting a new provider sign-in.
 * Never throws: a stale session is worth retrying, but it must not block the
 * user gesture that already opened the popup.
 *
 * @param {SignOutDeps & { timeoutMs?: number }} deps
 */
export async function runPreSignInSignOut({
  livePreview,
  hasBearer,
  requestSignOut,
  clearToken,
  timeoutMs = DEFAULT_PRE_SIGN_IN_TIMEOUT_MS,
}) {
  try {
    clearToken?.();
    if (livePreview || !hasBearer) {
      await withTimeout(requestSignOut?.(), timeoutMs);
    } else {
      await requestSignOut?.();
    }
  } catch {
    // Best effort — the new OAuth flow will overwrite the session anyway.
  }
}

/**
 * Sign out, clear local credentials, then redirect.
 * In the live preview the local clear is authoritative, so failures/timeouts
 * are swallowed. When deployed a failure rejects so the UI can offer a retry.
 *
 * @param {SignOutDeps & { timeoutMs?: number }} deps
 */
export async function runSignOut({
  livePreview,
  hasBearer,
  requestSignOut,
  clearToken,
  redirect,
  timeoutMs = DEFAULT_SIGN_OUT_TIMEOUT_MS,
}) {
  let serverError = null;
  try {
    await (livePreview ? withTimeout(requestSignOut?.(), timeoutMs) : requestSignOut?.());
  } catch (error) {
    serverError = error;
  }

  clearToken?.();

  if (!livePreview && serverError) {
    throw serverError;
  }
  // `hasBearer` is accepted for symmetry/testability; the local clear above
  // always runs, so the preview cannot keep re-attaching a dead token.
  void hasBearer;

  redirect?.();
}
