import React from "react";
import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { signOut } from "next-auth/react";
import styles from "../styles/Dashboard.module.css";

const NAV_GROUPS = [
  {
    label: "Home",
    links: [
      { href: "/dashboard", label: "Dashboard" },
    ],
  },
  {
    label: "Athletes",
    links: [
      { href: "/athletes", label: "Athletes" },
    ],
  },
  {
    label: "Coaches",
    links: [
      { href: "/admin/coaches", label: "Coaches", adminOnly: true },
      { href: "/admin/coach-accounts", label: "Coach accounts", adminOnly: true },
      { href: "/admin/coach-performances", label: "Coach evaluations", adminOnly: true },
      { href: "/coach-approvals", label: "Coach approvals", coachApproveOnly: true },
    ],
  },
  {
    label: "Training & Assessment",
    links: [
      { href: "/training-plans", label: "Training" },
    ],
  },
  {
    label: "Events & Program",
    links: [
      { href: "/event-plans", label: "Event plans" },
      { href: "/admin/catalog", label: "Sports & Events", adminOnly: true },
    ],
  },
  {
    label: "Reports",
    links: [
      { href: "/reports", label: "Reports" },
    ],
  },
  {
    label: "System",
    links: [
      { href: "/admin/metrics", label: "Metrics", adminOnly: true },
      { href: "/admin/audit-logs", label: "Audit logs", adminOnly: true },
      { href: "/admin/backup", label: "Backup", adminOnly: true },
    ],
  },
  {
    label: "Account",
    links: [
      { href: "/account", label: "My account" },
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
  const person = session?.user?.name || session?.user?.email || "Account";
  const currentPath = active || router.pathname;

  const isActive = (href) => (currentPath === href ? styles.navLinkActive : undefined);

  const nav = (
    <nav className={styles.sidebar} aria-label="Primary navigation">
      {NAV_GROUPS.map((group) => {
        const links = group.links.filter((link) => (!link.adminOnly || isAdmin) && (!link.coachApproveOnly || canApproveCoaches || isAdmin));
        if (!links.length) return null;
        return (
          <React.Fragment key={group.label}>
            <p className={styles.navHeading}>{group.label}</p>
            {links.map((link) => (
              <Link key={link.href} href={link.href} className={isActive(link.href)} onClick={() => setOpen(false)}>
                {link.label}
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
        <div className={styles.brand}>
          <Link href="/dashboard" onClick={() => setOpen(false)}>
            <img src="/sports_logo.png" alt="Cauayan City Sports" />
            <div>
              <p className={styles.eyebrow}>{eyebrow}</p>
              <span className={styles.brandTitle}>{title}</span>
            </div>
          </Link>
        </div>
        <div className={styles.userArea}>
          <button
            type="button"
            className={styles.menuToggle}
            aria-label="Toggle navigation menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            Menu
          </button>
          <span className={styles.userName}>{person}</span>
          <span className={styles.roleBadge}>{session?.user?.role}</span>
          <button type="button" className={styles.logoutBtn} onClick={() => signOut({ callbackUrl: "/login" })}>
            Log out
          </button>
        </div>
      </header>
      {open && <div className={styles.mobileNav}>{nav}</div>}
      <div className={styles.layout}>
        {nav}
        <main className={styles.content}>{children}</main>
      </div>
    </div>
  );
}
