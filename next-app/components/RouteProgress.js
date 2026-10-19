import { useEffect, useState } from "react";
import { useRouter } from "next/router";

/**
 * Lightweight, dependency-free top loading bar wired to Next's router events.
 * Gives immediate visual feedback when navigating to a slow route (e.g. /reports)
 * so a click never looks frozen.
 */
export default function RouteProgress() {
  const router = useRouter();
  const [phase, setPhase] = useState("idle"); // idle | loading | done

  useEffect(() => {
    if (!router) return;
    let doneTimer;

    const start = (url) => {
      if (!url || url === router.asPath) return;
      setPhase("loading");
    };
    const finish = () => {
      setPhase((current) => {
        if (current !== "loading") return current;
        doneTimer = window.setTimeout(() => setPhase("idle"), 420);
        return "done";
      });
    };

    router.events.on("routeChangeStart", start);
    router.events.on("routeChangeComplete", finish);
    router.events.on("routeChangeError", finish);

    return () => {
      router.events.off("routeChangeStart", start);
      router.events.off("routeChangeComplete", finish);
      router.events.off("routeChangeError", finish);
      if (doneTimer) window.clearTimeout(doneTimer);
    };
  }, [router]);

  if (phase === "idle") return null;

  return (
    <div
      className={`apms-route-progress ${phase}`}
      role="progressbar"
      aria-label="Loading page"
      aria-hidden={phase === "done" ? "true" : undefined}
    />
  );
}
