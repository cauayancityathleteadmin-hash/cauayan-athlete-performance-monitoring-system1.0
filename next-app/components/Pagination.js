import Link from "next/link";
import styles from "../styles/Dashboard.module.css";

export default function Pagination({ page, totalPages, basePath }) {
  if (totalPages <= 1) return null;
  const prev = page > 1 ? (basePath || "") + `?page=${page - 1}` : null;
  const next = page < totalPages ? (basePath || "") + `?page=${page + 1}` : null;
  return (
    <div className={styles.pagination}>
      <span>Page {page} of {totalPages}</span>
      {prev && <Link href={prev} className={styles.secondary}>← Prev</Link>}
      {next && <Link href={next} className={styles.secondary}>Next →</Link>}
    </div>
  );
}
