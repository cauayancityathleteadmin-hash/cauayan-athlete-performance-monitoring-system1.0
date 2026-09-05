import React from "react";

const SIZE = 600;

/**
 * Reusable 2x2 ID-picture upload control.
 * Crops the chosen image to a square (2x2 ratio), resizes to 600x600,
 * compresses to JPEG, uploads to Vercel Blob, and reports the public URL.
 */
export default function IdPhotoUpload({ value, onChange, required = false, label = "2x2 ID picture" }) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [cameraOpen, setCameraOpen] = React.useState(false);
  const inputRef = React.useRef(null);
  const videoRef = React.useRef(null);
  const streamRef = React.useRef(null);

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }

  React.useEffect(() => {
    return () => stopCamera();
  }, []);

  function closeCamera() {
    stopCamera();
    setCameraOpen(false);
  }

  async function openCamera() {
    setError("");
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      setError("The camera needs a secure (HTTPS) connection. Please open this page over HTTPS and try again.");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera not supported on this device or browser. Please use 'Choose photo' instead.");
      return;
    }
    if (navigator.permissions?.query) {
      try {
        const status = await navigator.permissions.query({ name: "camera" });
        if (status.state === "denied") {
          setError("Camera permission has been blocked in this browser. Allow camera access for this site (browser site settings), then tap 'Take photo' again.");
          return;
        }
      } catch (e) { /* permission query not supported in this browser — the getUserMedia prompt still applies */ }
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 1280 }, facingMode: "user" }, audio: false });
      streamRef.current = stream;
      setCameraOpen(true);
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      });
    } catch (e) {
      if (e && (e.name === "NotAllowedError" || e.name === "SecurityError")) {
        setError("Camera access was denied or blocked. Please allow camera permission for this site in your browser, then tap 'Take photo' again.");
      } else if (e && (e.name === "NotFoundError" || e.name === "OverconstrainedError")) {
        setError("No camera was detected on this device. Use 'Choose photo' to pick a picture instead.");
      } else if (e && e.name === "NotReadableError") {
        setError("The camera is already in use by another app. Close it and tap 'Take photo' again.");
      } else if (e && e.name === "AbortError") {
        setError("The camera request was cancelled. Tap 'Take photo' to try again.");
      } else {
        setError("Could not open the camera. Please allow camera permission or use 'Choose photo' instead.");
      }
    }
  }

  async function capturePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setBusy(true);
    setError("");
    try {
      const file = canvasToFile(video);
      const url = await processAndUpload(file);
      closeCamera();
      onChange(url);
    } catch (e) {
      setError(e.message || "Could not upload the captured photo.");
    } finally {
      setBusy(false);
    }
  }

  function canvasToFile(video) {
    const side = Math.min(video.videoWidth, video.videoHeight);
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(video, (video.videoWidth - side) / 2, (video.videoHeight - side) / 2, side, side, 0, 0, SIZE, SIZE);
    const blob = canvas.toDataURL("image/jpeg", 0.9);
    return dataURLtoFile(blob, "capture.jpg", "image/jpeg");
  }

  function dataURLtoFile(dataUrl, filename, mime) {
    const arr = dataUrl.split(",");
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mimeType = mimeMatch ? mimeMatch[1] : mime;
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) u8arr[n] = bstr.charCodeAt(n);
    return new File([u8arr], filename, { type: mimeType });
  }

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
              disabled={busy || cameraOpen}
              onChange={(e) => handleFile(e.target.files?.[0])}
              style={{ display: "none" }}
            />
          </label>
          {!cameraOpen && (
            <button
              type="button"
              onClick={openCamera}
              disabled={busy}
              style={{ display: "inline-block", padding: "10px 14px", border: "1px solid var(--border)", borderRadius: "6px", background: "rgba(127,199,175,.1)", color: "var(--foreground)", fontWeight: 600, cursor: "pointer", fontSize: "14px", textAlign: "left" }}
            >
              {busy ? "Uploading..." : "Take photo"}
            </button>
          )}
          {value && !required && !cameraOpen && (
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

      {cameraOpen && (
        <div style={{ marginTop: "12px", border: "1px solid var(--border)", borderRadius: "10px", padding: "14px", background: "rgba(6,38,30,.35)", maxWidth: 420 }}>
          <p style={{ margin: "0 0 10px", color: "var(--muted)", fontSize: "13px" }}>Line up your face in the square, then take the photo. Your photo is saved as a 2x2 ID picture.</p>
          <div style={{ position: "relative", width: "100%", maxWidth: 320, borderRadius: "8px", overflow: "hidden" }}>
            <video ref={videoRef} playsInline muted autoPlay style={{ width: "100%", display: "block", background: "#000" }} />
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", boxShadow: "inset 0 0 0 3px rgba(45,212,168,.8)", borderRadius: "8px", margin: "8%" }} />
          </div>
          <div style={{ display: "flex", gap: "10px", marginTop: "12px", flexWrap: "wrap" }}>
            <button type="button" onClick={capturePhoto} disabled={busy} style={{ padding: "10px 16px", border: "none", borderRadius: "6px", background: "var(--accent)", color: "#041f18", fontWeight: 700, cursor: "pointer", fontSize: "14px" }}>
              {busy ? "Uploading..." : "Capture photo"}
            </button>
            <button type="button" onClick={closeCamera} disabled={busy} style={{ padding: "10px 16px", border: "1px solid var(--border)", borderRadius: "6px", background: "transparent", color: "var(--foreground)", fontWeight: 600, cursor: "pointer", fontSize: "14px" }}>
              Cancel
            </button>
          </div>
        </div>
      )}
      {error && <p style={{ color: "var(--danger)", fontSize: "12px", marginTop: "6px" }}>{error}</p>}
    </div>
  );
}
