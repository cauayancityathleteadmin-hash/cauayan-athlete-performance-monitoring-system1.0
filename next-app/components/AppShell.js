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
};

const NAV_GROUPS = [
  {
    label: "Home",
    links: [
      { href: "/dashboard", label: "Dashboard", icon: "grid" },
    ],
  },
  {
    label: "Athletes",
    links: [
      { href: "/athletes", label: "Athletes", icon: "user" },
    ],
  },
  {
    label: "Coaches",
    caption: true,
    links: [
      { href: "/admin/coaches", label: "Coaches", icon: "users", adminOnly: true },
      { href: "/admin/coach-performances", label: "Coach evaluations", icon: "star", adminOnly: true },
      { href: "/coach-approvals", label: "Coach approvals", icon: "badgeCheck", coachApproveOnly: true },
      { href: "/admin/coach-accounts", label: "Coach accounts", icon: "key", adminOnly: true },
    ],
  },
  {
    label: "Training & Assessment",
    links: [
      { href: "/training-plans", label: "Training", icon: "clipboardCheck" },
    ],
  },
  {
    label: "Analytics",
    links: [
      { href: "/analytics", label: "Analytics", icon: "barChart" },
      { href: "/standings", label: "Standings", icon: "trophy" },
    ],
  },
  {
    label: "Events & Program",
    caption: true,
    links: [
      { href: "/event-plans", label: "Event plans", icon: "calendar" },
      { href: "/admin/catalog", label: "Sports & Discipline", icon: "flag", adminOnly: true },
    ],
  },
  {
    label: "Reports",
    links: [
      { href: "/reports", label: "Reports", icon: "fileText" },
    ],
  },
  {
    label: "System",
    caption: true,
    links: [
      { href: "/admin/metrics", label: "Metrics", icon: "gauge", adminOnly: true },
      { href: "/admin/audit-logs", label: "Audit logs", icon: "list", adminOnly: true },
      { href: "/admin/backup", label: "Backup", icon: "database", adminOnly: true },
    ],
  },
  {
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
  const person = session?.user?.name || session?.user?.email || "Account";
  const currentPath = active || router.pathname;

  const isActive = (href) => (currentPath === href ? styles.navLinkActive : undefined);

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

  const nav = (
    <nav className={styles.sidebar} aria-label="Primary navigation">
      {NAV_GROUPS.map((group) => {
        const links = group.links.filter((link) => (!link.adminOnly || isAdmin) && (!link.coachApproveOnly || (canApproveCoaches && !isAdmin)));
        if (!links.length) return null;
        const showCaption = group.caption && links.length > 1;
        return (
          <React.Fragment key={group.label}>
            {showCaption && <p className={styles.navHeading}>{group.label.toUpperCase()}</p>}
            {links.map((link) => (
              <Link key={link.href} href={link.href} className={isActive(link.href)} title={link.label} aria-label={link.label} onClick={() => setOpen(false)}>
                <span className={styles.navIcon} aria-hidden="true">{ICONS[link.icon]}</span>
                <span className={styles.navLabel}>{link.label}</span>
              </Link>
            ))}
          </React.Fragment>
        );
      })}
    </nav>
  );

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.topLeft}>
          <button
            type="button"
            className={styles.menuToggle}
            aria-label="Toggle navigation menu"
            aria-expanded={collapsed ? false : open}
            onClick={toggleNav}
            title={collapsed ? "Show menu" : "Hide menu"}
          >
            ☰
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
      {open && <div className={styles.mobileNav}>{nav}</div>}
      <div className={styles.layout}>
        {!collapsed && nav}
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}