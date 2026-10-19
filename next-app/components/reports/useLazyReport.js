import React from "react";

export async function fetchJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status}).`);
  return body;
}

// Lazily loads report data the first time the section scrolls near the
// viewport, so /reports does not fire every report API call on page load.
// load() can be called again (filter/period change); only the latest request's
// result is applied. statusRef lets callers check "have we loaded at least
// once?" without re-running effects during the loading transition.
export default function useLazyReport(loader) {
  const [state, setState] = React.useState({ status: "idle", data: null, error: null });
  const loaderRef = React.useRef(loader);
  const runIdRef = React.useRef(0);
  const ref = React.useRef(null);
  const statusRef = React.useRef("idle");

  // Sync refs in effects (refs must not be written during render). This hook's
  // effects are declared before any consumer effect, so consumers always read
  // up-to-date values.
  React.useEffect(() => { loaderRef.current = loader; });
  React.useEffect(() => { statusRef.current = state.status; });

  const load = React.useCallback(async () => {
    const runId = ++runIdRef.current;
    setState((s) => ({ status: "loading", data: s.data, error: null }));
    try {
      const data = await loaderRef.current();
      if (runId !== runIdRef.current) return;
      setState({ status: "ready", data, error: null });
    } catch (err) {
      if (runId !== runIdRef.current) return;
      setState({ status: "error", data: null, error: (err && err.message) || "Failed to load report." });
    }
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          load();
        }
      },
      { rootMargin: "200px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [load]);

  return { ref, status: state.status, data: state.data, error: state.error, load, statusRef };
}
