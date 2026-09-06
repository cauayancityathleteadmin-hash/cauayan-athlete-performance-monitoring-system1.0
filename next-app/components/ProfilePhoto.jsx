import React from "react";

export default function ProfilePhoto({ url, firstName, lastName, size = 96, radius = 10, style }) {
  const initials = `${(firstName || "?").charAt(0)}${(lastName || "?").charAt(0)}`.toUpperCase();
  const base = {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: size,
    height: size,
    flexShrink: 0,
    borderRadius: radius,
    border: "1px solid var(--border)",
    overflow: "hidden",
    ...style,
  };
  if (url) {
    return (
      <span aria-label="2x2 ID picture" style={{ ...base, background: "rgba(6,38,30,.4)" }}>
        <img src={url} alt="2x2 ID picture" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </span>
    );
  }
  return (
    <span
      aria-label="Initials placeholder"
      style={{
        ...base,
        background: "rgba(45,212,168,.18)",
        color: "var(--accent)",
        fontWeight: 800,
        fontSize: Math.max(13, Math.round(size * 0.34)),
        letterSpacing: "0.02em",
      }}
    >
      {initials}
    </span>
  );
}