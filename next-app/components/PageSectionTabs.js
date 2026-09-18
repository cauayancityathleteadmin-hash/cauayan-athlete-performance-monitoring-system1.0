import React from "react";
import { useRouter } from "next/router";
import styles from "../styles/Dashboard.module.css";

export default function PageSectionTabs({ sections }) {
  const router = useRouter();
  const [activeId, setActiveId] = React.useState(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "");
      if (hash && sections.some((s) => s.sectionId === hash)) return hash;
    }
    return sections[0]?.sectionId || "";
  });
  const [initialized, setInitialized] = React.useState(false);
  const observerRef = React.useRef(null);

  const scrollToSection = (sectionId) => {
    const el = document.getElementById(sectionId);
    if (el) {
      const topbarHeight = 72;
      const targetPosition = el.getBoundingClientRect().top + window.pageYOffset - topbarHeight - 8;
      window.scrollTo({ top: targetPosition, behavior: "smooth" });
      setActiveId(sectionId);
      router.replace(`#${sectionId}`, undefined, { shallow: true });
    }
  };

  React.useEffect(() => {
    const hash = router.asPath.includes("#") ? router.asPath.split("#")[1] : "";
    if (hash && sections.some((s) => s.sectionId === hash)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveId(hash);
      setTimeout(() => {
        const el = document.getElementById(hash);
        if (el) {
          const topbarHeight = 72;
          const targetPosition = el.getBoundingClientRect().top + window.pageYOffset - topbarHeight - 8;
          window.scrollTo({ top: targetPosition, behavior: "smooth" });
        }
      }, 50);
    }
    setInitialized(true);
  }, [router.asPath, sections]);

  React.useEffect(() => {
    if (!initialized) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting);
        if (!visible.length) return;
        const top = visible.find((e) => e.boundingClientRect.top >= 0) || visible[0];
        setActiveId(top.target.id);
      },
      {
        rootMargin: "-80px 0px -70% 0px",
        threshold: 0,
      }
    );

    const els = sections.map((s) => document.getElementById(s.sectionId)).filter(Boolean);
    els.forEach((el) => observer.observe(el));
    observerRef.current = observer;

    return () => observer.disconnect();
  }, [sections, initialized]);

  return (
    <nav
      className={`${styles.pageTabs} ${styles.sticky}`}
      role="navigation"
      aria-label="Page sections"
    >
      {sections.map((section) => (
        <button
          key={section.sectionId}
          role="button"
          aria-current={section.sectionId === activeId ? "location" : undefined}
          id={`tab-${section.sectionId}`}
          className={`${styles.pageTab} ${section.sectionId === activeId ? styles.active : ""}`}
          onClick={() => scrollToSection(section.sectionId)}
        >
          {section.label}
        </button>
      ))}
    </nav>
  );
}