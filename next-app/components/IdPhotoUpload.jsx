import React from "react";

const SIZE = 600;

/**
 * Reusable 2x2 ID-picture upload control.
 * Crops the chosen image to a square (2x2 ratio), resizes to 600x600,
 * compresses to JPEG, uploads to Vercel Blob, and reports the public URL.
 */
export default function IdPhotoUpload({ value, onChange, required = true, label = "2x2 ID picture" }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const inputRef = React.useRef(null);

  async function handleFile(file) {
    setError("");
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setError("Please choose a JPEG, PNG, or WEBP image.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image is too large (max 5 MB).");
      return;
    }
    setBusy(true);
    try {
      const url = await processAndUpload(file);
      onChange(url);
    } catch (e) {
      setError(e.message || "Could not upload the ID picture.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function processAndUpload(file) {
    const { base64, mime } = await cropToIdPhoto(file);
    const csrf = await fetch("/api/csrf").then((r) => r.json()).catch(() => ({}));
    const response = await fetch("/api/upload/picture", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token || "" },
      body: JSON.stringify({ base64, mime }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "Upload failed.");
    return result.url;
  }

  function cropToIdPhoto(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const sx = (img.naturalWidth - side) / 2;
        const sy = (img.naturalHeight - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Could not process the image."));
            const reader = new FileReader();
            reader.onload = () => resolve({ base64: reader.result.split(",")[1], mime: "image/jpeg" });
            reader.onerror = () => reject(new Error("Could not read the image."));
            reader.readAsDataURL(blob);
          },
          "image/jpeg",
          0.85
        );
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("The selected file is not a valid image."));
      };
      img.src = url;
    });
  }

  return (
    <div>
      <label style={{ display: "flex", flexDirection: "column", gap: "8px", color: "var(--muted)", fontWeight: 700, fontSize: "15px" }}>
        {label}
        {required && <span style={{ color: "var(--danger)", fontSize: "12px", fontWeight: 600 }}>Required — a clear, front-facing 2x2 ID photo</span>}
      </label>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginTop: "8px", flexWrap: "wrap" }}>
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: "8px",
            border: "2px dashed var(--border)",
            background: value ? "transparent" : "rgba(6,38,30,.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {value ? (
            <img src={value} alt="2x2 ID preview" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ color: "var(--muted)", fontSize: "12px", textAlign: "center", padding: "4px" }}>No photo</span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <label style={{ display: "inline-flex" }}>
            <span
              style={{
                display: "inline-block",
                padding: "10px 14px",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                background: "rgba(45,212,168,.12)",
                color: "var(--accent)",
                fontWeight: 600,
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              {busy ? "Uploading..." : value ? "Change photo" : "Choose photo"}
            </span>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => handleFile(e.target.files?.[0])}
              style={{ display: "none" }}
            />
          </label>
          {value && !required && (
            <button
              type="button"
              onClick={() => onChange("")}
              style={{ background: "transparent", border: "none", color: "var(--danger)", cursor: "pointer", fontWeight: 600, padding: 0, textAlign: "left", fontSize: "13px" }}
            >
              Remove photo
            </button>
          )}
        </div>
      </div>
      {error && <p style={{ color: "var(--danger)", fontSize: "12px", marginTop: "6px" }}>{error}</p>}
    </div>
  );
}
