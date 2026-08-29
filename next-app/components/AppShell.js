import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { signOut } from "next-auth/react";
import styles from "../styles/Dashboard.module.css";

const NAV_LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/athletes", label: "Athletes" },
  { href: "/assessments", label: "Assessments" },
  { href: "/analytics", label: "Analytics" },
  { href: "/event-plans", label: "Sports event plans" },
  { href: "/reports", label: "Athlete reports" },
];

const ADMIN_LINKS = [
  { href: "/admin", label: "Admin Dashboard" },
  { href: "/admin/coaches", label: "Coaches" },
  { href: "/admin/catalog", label: "Sports & Events" },
  { href: "/admin/metrics", label: "Performance Metrics" },
  { href: "/admin/audit-logs", label: "Audit Logs" },
  { href: "/admin/backup", label: "Database Backup" },
];

export default function AppShell({
  session,
  isAdmin,
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
      {NAV_LINKS.map((link) => (
        <Link key={link.href} href={link.href} className={isActive(link.href)} onClick={() => setOpen(false)}>
          {link.label}
        </Link>
      ))}
      {isAdmin && (
        <>
          <p className={styles.navHeading}>Administration</p>
          {ADMIN_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={isActive(link.href)} onClick={() => setOpen(false)}>
              {link.label}
            </Link>
          ))}
        </>
      )}
    </nav>
  );

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <Link href="/dashboard" onClick={() => setOpen(false)}>
            <img src="/cauayan logo.png" alt="Cauayan City" />
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
          <Link href="/account">My Account</Link>
          <button type="button" className={styles.logoutBtn} onClick={() => signOut({ callbackUrl: "/login" })}>
            Sign out
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
