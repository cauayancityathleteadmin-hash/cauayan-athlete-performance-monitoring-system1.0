import React from "react";
import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { signOut } from "next-auth/react";
import styles from "../styles/Dashboard.module.css";

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: "2",
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

const ICONS = {
  grid: (
    <svg {...iconProps}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  user: (
    <svg {...iconProps}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  ),
  badgeCheck: (
    <svg {...iconProps}>
      <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  ),
  users: (
    <svg {...iconProps}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  star: (
    <svg {...iconProps}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
    </svg>
  ),
  key: (
    <svg {...iconProps}>
      <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />
    </svg>
  ),
  clipboardCheck: (
    <svg {...iconProps}>
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M9 14l2 2 4-4" />
    </svg>
  ),
  barChart: (
    <svg {...iconProps}>
      <line x1="18" y1="20" x2="18" y2="13" />
      <line x1="12" y1="20" x2="12" y2="6" />
      <line x1="6" y1="20" x2="6" y2="15" />
      <line x1="3" y1="20" x2="21" y2="20" />
    </svg>
  ),
  trophy: (
    <svg {...iconProps}>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v6a5 5 0 0 1-10 0z" />
      <path d="M7 6H4a2 2 0 0 0 2 4h1" />
      <path d="M17 6h3a2 2 0 0 1-2 4h-1" />
    </svg>
  ),
  calendar: (
    <svg {...iconProps}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  flag: (
    <svg {...iconProps}>
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <line x1="4" y1="22" x2="4" y2="15" />
    </svg>
  ),
  fileText: (
    <svg {...iconProps}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  gauge: (
    <svg {...iconProps}>
      <path d="M5 14a7 7 0 1 1 14 0" />
      <path d="M12 14l4-4" />
      <path d="M2.5 17h3" />
      <path d="M18.5 17h3" />
    </svg>
  ),
  list: (
    <svg {...iconProps}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  database: (
    <svg {...iconProps}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M21 5v14c0 1.66-4 3-9 3s-9-1.34-9-3V5" />
      <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
    </svg>
  ),
  userCircle: (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="10" r="3.5" />
      <path d="M5.5 19a7.5 7.5 0 0 1 13 0" />
    </svg>
  ),
  trendingUp: (
    <svg {...iconProps}>
      <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
      <polyline points="16 7 22 7 22 13" />
    </svg>
  ),
};

const NAV_GROUPS = [
  {
    key: "home",
    label: "Home",
    links: [
      { href: "/dashboard", label: "Dashboard", icon: "grid" },
    ],
  },
  {
    key: "athletes",
    label: "Athletes",
    links: [
      { href: "/athletes", label: "Athletes", icon: "user" },
    ],
  },
  {
    key: "coaches",
    label: "Coaches",
    icon: "users",
    menu: true,
    links: [
      { href: "/admin/coaches", label: "Coaches", icon: "users", adminOnly: true },
      { href: "/admin/coach-performances", label: "Coach evaluations", icon: "star", adminOnly: true },
      { href: "/coach-approvals", label: "Coach approvals", icon: "badgeCheck", coachApproveOnly: true },
      { href: "/admin/coach-accounts", label: "Coach accounts", icon: "key", adminOnly: true },
    ],
  },
  {
    key: "training",
    label: "Training",
    icon: "clipboardCheck",
    menu: true,
    shortcuts: "plans",
    links: [
      { href: "/training-plans", label: "Trainings", icon: "clipboardCheck" },
    ],
  },
  {
    key: "analytics",
    label: "Analytics",
    links: [
      { href: "/analytics", label: "Analytics", icon: "barChart" },
      { href: "/standings", label: "Standings", icon: "trophy" },
    ],
  },
  {
    key: "events",
    label: "Events & Program",
    links: [
      { href: "/event-plans", label: "Event plans", icon: "calendar" },
      { href: "/admin/catalog", label: "Sports & Discipline", icon: "flag", adminOnly: true },
    ],
  },
  {
    key: "reports",
    label: "Reports",
    links: [
      { href: "/reports", label: "Reports", icon: "fileText" },
    ],
  },
  {
    key: "system",
    label: "System",
    icon: "gauge",
    menu: true,
    links: [
      { href: "/admin/metrics", label: "Metrics", icon: "gauge", adminOnly: true },
      { href: "/admin/audit-logs", label: "Audit logs", icon: "list", adminOnly: true },
      { href: "/admin/backup", label: "Backup", icon: "database", adminOnly: true },
    ],
  },
  {
    key: "account",
    label: "Account",
    links: [
      { href: "/account", label: "My account", icon: "userCircle" },
    ],
  },
];

export default function AppShell({
  session,
  isAdmin,
  canApproveCoaches = Boolean(session?.user?.canApproveCoaches),
  eyebrow = "Cauayan City",
  title = "Athlete performance",
  active,
  children,
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [openMenus, setOpenMenus] = useState(() => {
    let stored = [];
    if (typeof window !== "undefined") {
      try { const raw = window.localStorage.getItem("apms.sidebarMenus"); if (raw) stored = JSON.parse(raw); } catch (e) {}
    }
    return stored;
  });
  const [shortcuts, setShortcuts] = React.useState(null);
  const shortcutsRef = React.useRef(null);
  const [navSearch, setNavSearch] = React.useState({});
  const [openPlans, setOpenPlans] = React.useState([]);
  const person = session?.user?.name || session?.user?.email || "Account";
  const currentPath = active || router.pathname;

  function isActiveHref(href) {
    return currentPath === href || (href !== "/" && currentPath.startsWith(href + "/"));
  }
  const isActive = (href) => (isActiveHref(href) ? styles.navLinkActive : undefined);

  function ensureShortcuts() {
    if (shortcutsRef.current) return;
    shortcutsRef.current = true;
    fetch("/api/nav-shortcuts").then((r) => r.json()).then((data) => {
      const plans = Array.isArray(data?.plans) ? data.plans.map((p) => ({
        id: p.id,
        label: p.planName || "Untitled plan",
        href: `/training-plans/${p.id}`,
        athletes: Array.isArray(p.athletes) ? p.athletes.map((a) => ({
          id: a.id,
          label: `${a.lastName || ""}${a.lastName && a.firstName ? ", " : ""}${a.firstName || ""}` || "Athlete",
          href: `/training-plans/${p.id}/athletes/${a.id}`,
        })) : [],
      })) : [];
      setShortcuts({ plans });
    }).catch(() => {});
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = [];
    try {
      const raw = window.localStorage.getItem("apms.sidebarMenus");
      if (raw) stored.push(...JSON.parse(raw));
    } catch (e) {}
    const grp = NAV_GROUPS.find((g) => g.links.some((l) => isActiveHref(l.href)));
    if (grp) {
      if (!stored.includes(grp.key)) stored.push(grp.key);
      if (grp.shortcuts) ensureShortcuts();
    }
    const t = window.setTimeout(() => setOpenMenus([...new Set(stored)]), 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let stored;
    try {
      stored = window.localStorage.getItem("apms.sidebarCollapsed");
    } catch (e) {
      return;
    }
    if (stored === "true") {
      const t = window.setTimeout(() => setCollapsed(true), 0);
      return () => window.clearTimeout(t);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const toggleNav = () => {
    setOpen((v) => !v);
    setCollapsed((v) => {
      const next = !v;
      try {
        if (typeof window !== "undefined") window.localStorage.setItem("apms.sidebarCollapsed", String(next));
      } catch (e) {}
      return next;
    });
  };

  function toggleMenu(key) {
    const grp = NAV_GROUPS.find((g) => g.key === key);
    const willOpen = !openMenus.includes(key);
    if (grp?.shortcuts && willOpen) ensureShortcuts();
    setOpenMenus((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try { if (typeof window !== "undefined") window.localStorage.setItem("apms.sidebarMenus", JSON.stringify(next)); } catch (e) {}
      return next;
    });
  }

  function togglePlan(id) {
    setOpenPlans((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      return next;
    });
  }

  const nav = (
    <nav className={styles.sidebar} aria-label="Primary navigation">
      {NAV_GROUPS.map((group) => {
        const links = group.links.filter((link) => (!link.adminOnly || isAdmin) && (!link.coachApproveOnly || (canApproveCoaches && !isAdmin)));
        if (!group.menu) {
          if (!links.length) return null;
          return (
            <React.Fragment key={group.key}>
              {links.map((link) => (
                <Link key={link.href} href={link.href} className={isActive(link.href)} title={link.label} aria-label={link.label} aria-current={isActive(link.href) ? "page" : undefined} onClick={() => setOpen(false)}>
                  <span className={styles.navIcon} aria-hidden="true">{ICONS[link.icon]}</span>
                  <span className={styles.navLabel}>{link.label}</span>
                </Link>
              ))}
            </React.Fragment>
          );
        }
        if (!links.length && !group.shortcuts) return null;
        const isOpen = openMenus.includes(group.key);
        const groupActive = links.some((link) => isActiveHref(link.href));
        return (
          <div key={group.key} className={styles.navGroup}>
            <button type="button" className={`${styles.navGroupBtn}${groupActive ? ` ${styles.navGroupBtnActive}` : ""}${isOpen ? ` ${styles.navGroupBtnOpen}` : ""}`} aria-expanded={isOpen} onClick={() => toggleMenu(group.key)}>
              <span className={styles.navIcon} aria-hidden="true">{ICONS[group.icon]}</span>
              <span className={styles.navLabel}>{group.label}</span>
              <span className={`${styles.navChevron}${isOpen ? ` ${styles.navChevronOpen}` : ""}`} aria-hidden="true">›</span>
            </button>
            {isOpen && (
              <div className={styles.navGroupBody}>
                {links.map((link) => (
                  <Link key={link.href} href={link.href} className={`${styles.navSubLink}${isActive(link.href) ? ` ${styles.navLinkActive}` : ""}`} onClick={() => setOpen(false)}>
                    <span className={styles.navIcon} aria-hidden="true">{ICONS[link.icon]}</span>
                    <span className={styles.navSubLabel}>{link.label}</span>
                  </Link>
                ))}
                {group.shortcuts && shortcuts && (
                  <div className={styles.navShortcuts}>
                    {(shortcuts[group.shortcuts] || []).length > 8 && (
                      <input className={styles.navShortcutSearch} type="search" placeholder="Search plans..." value={navSearch[group.key] || ""} onChange={(e) => setNavSearch((s) => ({ ...s, [group.key]: e.target.value }))} aria-label="Search plans" />
                    )}
                    {(() => {
                      const items = shortcuts[group.shortcuts] || [];
                      const q = (navSearch[group.key] || "").toLowerCase().trim();
                      const filtered = q ? items.filter((it) => it.label.toLowerCase().includes(q)) : items;
                      if (!filtered.length) return <span className={styles.navShortcutEmpty}>{items.length ? "No matches." : "Loading..."}</span>;
                      return filtered.map((it) => {
                        const expanded = openPlans.includes(it.id);
                        return (
                          <div key={it.id} className={styles.navShortcutGroup}>
                            <button type="button" className={`${styles.navShortcutToggle}${expanded ? ` ${styles.navGroupBtnOpen}` : ""}`} aria-expanded={expanded} onClick={() => togglePlan(it.id)}>
                              <span className={styles.navChevron} aria-hidden="true">›</span>
                              <span className={styles.navSubLabel}>{it.label}</span>
                            </button>
                            {expanded && (
                              <div className={styles.navGroupBody} style={{ paddingBottom: 0 }}>
                                <div className={styles.navSubLink} style={{ cursor: "default" }}>
                                  <span className={styles.navSubDot} aria-hidden="true" />
                                  <span className={`${styles.navSubLabel} ${styles.navShortcutsMini}`}>Jump to:</span>
                                </div>
                                <Link href={`/training-plans/${it.id}#overview`} className={styles.navSubLink} onClick={() => setOpen(false)}>
                                  <span className={styles.navSubDot} aria-hidden="true" />
                                  <span className={styles.navSubLabel}>Overview</span>
                                </Link>
                                <Link href={`/training-plans/${it.id}#monitoring`} className={styles.navSubLink} onClick={() => setOpen(false)}>
                                  <span className={styles.navSubDot} aria-hidden="true" />
                                  <span className={styles.navSubLabel}>Monitoring</span>
                                </Link>
                                {!isAdmin && (
                                  <Link href={`/training-plans/${it.id}#assess`} className={styles.navSubLink} onClick={() => setOpen(false)}>
                                    <span className={styles.navSubDot} aria-hidden="true" />
                                    <span className={styles.navSubLabel}>Assess athletes</span>
                                  </Link>
                                )}
                                <Link href={`/training-plans/${it.id}#roster`} className={styles.navSubLink} onClick={() => setOpen(false)}>
                                  <span className={styles.navSubDot} aria-hidden="true" />
                                  <span className={styles.navSubLabel}>Roster</span>
                                </Link>
                                {it.athletes?.length > 0 && (
                                  <>
                                    <div className={styles.navSubLink} style={{ cursor: "default", marginTop: 4 }}>
                                      <span className={styles.navSubDot} aria-hidden="true" />
                                      <span className={`${styles.navSubLabel} ${styles.navShortcutsMini}`}>Athletes on this plan:</span>
                                    </div>
                                    {it.athletes.map((a) => (
                                      <Link key={a.id} href={a.href} className={`${styles.navSubLink} ${styles.navShortcutAthlete}`} onClick={() => setOpen(false)}>
                                        <span className={styles.navSubDot} aria-hidden="true" />
                                        <span className={styles.navSubLabel}>{a.label}</span>
                                      </Link>
                                    ))}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      });
                    })()}
                  </div>
                )}
                {group.shortcuts && !shortcuts && (
                  <span className={styles.navShortcutEmpty}>Loading...</span>
                )}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#apms-main">
        Skip to main content
      </a>
      <header className={styles.topbar}>
        <div className={styles.topLeft}>
          <button
            type="button"
            className={styles.menuToggle}
            aria-label={collapsed ? "Open main menu" : "Close main menu"}
            aria-expanded={collapsed ? false : open}
            onClick={toggleNav}
            title={collapsed ? "Show menu" : "Hide menu"}
          >
            {open && !collapsed ? "✕" : "☰"}
          </button>
          <div className={styles.brand}>
            <Link href="/dashboard" onClick={() => setOpen(false)}>
              <img src="/sports_logo.png" alt="Cauayan City Sports" />
              <div>
                <p className={styles.eyebrow}>{eyebrow}</p>
                <span className={styles.brandTitle}>{title}</span>
              </div>
            </Link>
          </div>
        </div>
        <div className={styles.userArea}>
          <span className={styles.userName}>{person}</span>
          <span className={styles.roleBadge}>{session?.user?.role}</span>
          <button type="button" className={styles.logoutBtn} onClick={() => signOut({ callbackUrl: "/login" })}>
            Log out
          </button>
        </div>
      </header>
      {open && <div className={styles.mobileNav}><button type="button" className={styles.menuClose} onClick={() => setOpen(false)}>✕ Close menu</button>{nav}</div>}
      <div className={styles.layout}>
        {!collapsed && nav}
        <main id="apms-main" className={styles.content} tabIndex={-1}>{children}</main>
      </div>
    </div>
  );
}