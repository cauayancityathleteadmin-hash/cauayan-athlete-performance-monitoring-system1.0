import React from "react";

/**
 * SectionShortcutNav — reusable in-page jump navigation.
 * Renders a sticky horizontal strip of links for a page's stacked sections.
 * Scrollspy highlights the section currently in view; #sectionId deep links
 * are honoured on load (including sections that mount lazily after data loads).
 *
 * Props:
 *   sections: [{ label: string, sectionId: string }] in page order.
 */
export default function SectionShortcutNav({ sections }) {
  const [activeId, setActiveId] = React.useState("");
  const idList = React.useMemo(() => sections.map((s) => s.sectionId), [sections]);

  React.useEffect(() => {
    if (!idList.length) return undefined;
    const observed = new Set();
    let io = null;

    function startObserver() {
      if (io) io.disconnect();
      const els = idList.map((id) => document.getElementById(id)).filter(Boolean);
      els.forEach((el) => observed.add(el));
      if (!els.length) return;
      io = new IntersectionObserver(
        (entries) => {
          const visible = entries.filter((e) => e.isIntersecting);
          if (!visible.length) return;
          const top = visible.find((e) => e.intersectionRect.top > 0) || visible[0];
          setActiveId(top.target.id);
        },
        { rootMargin: "-130px 0px -70% 0px", threshold: 0 }
      );
      els.forEach((el) => io.observe(el));
    }

    startObserver();

    // Some sections mount only after async data arrives — keep polling briefly.
    const retry = setInterval(() => {
      const missing = idList.some((id) => document.getElementById(id) && !observed.has(document.getElementById(id)));
      if (missing) startObserver();
    }, 500);
    const stopRetry = setTimeout(() => clearInterval(retry), 8000);

    // Ensure the strip is refreshed after the first paint/load settles.
    const settled = setTimeout(() => startObserver(), 1200);

    return () => {
      clearInterval(retry);
      clearTimeout(stopRetry);
      clearTimeout(settled);
      if (io) io.disconnect();
    };
  }, [idList]);

  // Honor #sectionId deep links, incl. sections that mount after fetch.
  React.useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";
    if (!hash || !idList.includes(hash)) return undefined;
    let tries = 0;
    const timer = setInterval(() => {
      const el = document.getElementById(hash);
      if (el) {
        clearInterval(timer);
        setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      } else if (++tries > 24) {
        clearInterval(timer);
      }
    }, 150);
    return () => clearInterval(timer);
  }, [idList]);

  function goTo(event, sectionId) {
    event.preventDefault();
    const el = document.getElementById(sectionId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    try {
      history.replaceState(null, "", `#${sectionId}`);
    } catch (e) {
      /* ignore */
    }
  }

  if (!sections.length) return null;

  return (
    <nav className="ssn" aria-label="On this page">
      <style jsx>{`
        .ssn {
          position: sticky;
          top: 0;
          z-index: 150;
          display: flex;
          align-items: center;
          gap: 8px;
          margin: 16px 0;
          padding: 10px 12px;
          background: rgba(6, 38, 30, .97);
          border: 1px solid var(--border);
          border-radius: 12px;
        }
        .ssnTrack {
          display: flex;
          align-items: center;
          gap: 8px;
          overflow-x: auto;
          scrollbar-width: thin;
          width: 100%;
        }
        .ssnTrack a {
          flex: 0 0 auto;
          padding: 6px 12px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 600;
          color: var(--muted);
          border: 1px solid transparent;
          text-decoration: none;
          white-space: nowrap;
          transition: color .15s ease, background .15s ease, border-color .15s ease;
        }
        .ssnTrack a:hover {
          color: var(--accent);
          border-color: rgba(45, 212, 168, .45);
        }
        .ssnTrack a.active {
          color: #06261e;
          background: var(--accent);
          border-color: var(--accent);
        }
        @media (max-width: 768px) {
          .ssn {
            top: 56px;
          }
        }
      `}</style>
      <div className="ssnTrack">
        {sections.map((s) => (
          <a
            key={s.sectionId}
            href={`#${s.sectionId}`}
            onClick={(e) => goTo(e, s.sectionId)}
            className={activeId === s.sectionId ? "active" : undefined}
            aria-current={activeId === s.sectionId ? "true" : undefined}
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  );
}