import styles from "../styles/Dashboard.module.css";

/**
 * Consistent success / error feedback for forms (audit U-H6): a green
 * "Saved" style vs a red "Error" style, announced politely to screen readers.
 * Accepts either a plain string or an object { text, kind } where kind is
 * "success" | "error". Renders nothing when there is no message.
 */
export default function FormMessage({ message, kind = "success", className = "", style }) {
  if (!message) return null;
  const text = typeof message === "string" ? message : message.text;
  const tone = typeof message === "string" ? kind : message.kind;
  if (!text) return null;
  const cls = tone === "error" ? styles.formError : styles.formSuccess;
  return (
    <p role="status" className={`${cls} ${className}`.trim()} style={style}>
      {text}
    </p>
  );
}
