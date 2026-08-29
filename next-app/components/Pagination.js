import Link from "next/link";
import styles from "../styles/Dashboard.module.css";

export default function Pagination({ page, totalPages, basePath, query }) {
  if (totalPages <= 1) return null;
  const make = (p) => {
    const params = new URLSearchParams();
    Object.entries(query || {})
      .filter(([, value]) => value !== undefined && value !== null)
      .forEach(([key, value]) => params.append(key, String(value)));
    params.set("page", String(p));
    const qs = params.toString();
    return (basePath || "") + (qs ? `?${qs}` : "");
  };
  const prev = page > 1 ? make(page - 1) : null;
  const next = page < totalPages ? make(page + 1) : null;
  return (
    <div className={styles.pagination}>
      <span>Page {page} of {totalPages}</span>
      {prev && <Link href={prev} className={styles.secondary}>← Prev</Link>}
      {next && <Link href={next} className={styles.secondary}>Next →</Link>}
    </div>
  );
}
