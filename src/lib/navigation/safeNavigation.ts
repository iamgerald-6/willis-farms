/** Next.js / React Query abort in-flight work when navigating — not a user-facing error. */

export function isNavigationAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { name?: string; code?: string; message?: string };
  if (e.name === "AbortError" || e.code === "ERR_CANCELED") return true;
  if (typeof e.message === "string" && /aborted|cancel/i.test(e.message)) {
    return true;
  }
  return false;
}

/** Swallow abort errors from router navigation during rapid back/forward. */
export function ignoreNavigationAbort(
  navigation: Promise<unknown> | void,
): void {
  if (
    navigation &&
    typeof (navigation as Promise<unknown>).then === "function"
  ) {
    void (navigation as Promise<unknown>).catch((error) => {
      if (!isNavigationAbortError(error)) throw error;
    });
  }
}
