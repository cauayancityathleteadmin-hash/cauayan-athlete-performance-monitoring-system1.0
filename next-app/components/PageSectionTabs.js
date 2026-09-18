import React from "react";
import { useRouter } from "next/router";
import styles from "../styles/Dashboard.module.css";

export default function PageSectionTabs({ sections, children, defaultSection }) {
  const router = useRouter();
  const [activeId, setActiveId] = React.useState(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash.replace("#", "");
      if (hash && sections.some((s) => s.sectionId === hash)) return hash;
    }
    return defaultSection || sections[0]?.sectionId || "";
  });
  const initialized = React.useRef(false);

  React.useEffect(() => {
    const hash = router.asPath.includes("#") ? router.asPath.split("#")[1] : "";
    if (hash && sections.some((s) => s.sectionId === hash)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveId(hash);
    }
    initialized.current = true;
  }, [router.asPath, sections]);

  React.useEffect(() => {
    if (!initialized.current) return;
    const newHash = `#${activeId}`;
    if (router.asPath !== newHash) {
      router.replace(newHash, undefined, { shallow: true });
    }
  }, [activeId, router]);

  const activeSection = sections.find((s) => s.sectionId === activeId) || sections[0];

  return (
    <>
      <div className={`${styles.pageTabs} ${styles.sticky}`} role="tablist" aria-label="Page sections">
        {sections.map((section) => (
          <button
            key={section.sectionId}
            role="tab"
            aria-selected={section.sectionId === activeId}
            aria-controls={`panel-${section.sectionId}`}
            id={`tab-${section.sectionId}`}
            className={`${styles.pageTab} ${section.sectionId === activeId ? styles.active : ""}`}
            onClick={() => setActiveId(section.sectionId)}
          >
            {section.label}
          </button>
        ))}
      </div>

      <div className={styles.tabPanels}>
        {React.Children.map(children, (child) => {
          if (!React.isValidElement(child)) return child;
          const sectionId = child.props.id || child.props.sectionId;
          if (!sectionId) return child;
          const isActive = sectionId === activeId;
          return React.cloneElement(child, {
            hidden: !isActive,
            "aria-labelledby": `tab-${sectionId}`,
            role: "tabpanel",
            id: `panel-${sectionId}`,
            style: { ...child.props.style, display: isActive ? "" : "none" },
          });
        })}
      </div>
    </>
  );
}