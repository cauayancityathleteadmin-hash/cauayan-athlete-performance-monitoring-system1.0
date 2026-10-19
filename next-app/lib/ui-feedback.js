/**
 * Reload the current route after a short delay so a form's success message is
 * actually visible before the page refreshes (audit U-H5: an instant
 * router.reload() wiped the confirmation the user just earned).
 */
export function reloadSoon(router, delay = 900) {
  if (!router || typeof window === "undefined") return;
  window.setTimeout(() => router.reload(), delay);
}
