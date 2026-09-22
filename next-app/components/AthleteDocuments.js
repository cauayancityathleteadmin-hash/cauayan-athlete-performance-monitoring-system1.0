import React from "react";
import styles from "../styles/Dashboard.module.css";

const MAX_BYTES = 10 * 1024 * 1024;

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  return isNaN(d) ? "—" : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function fmtBytes(n) {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function toDateInput(value) {
  const d = new Date(value);
  if (isNaN(d)) return "";
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function resolveMime(file) {
  if (!file) return "";
  if (file.type) return file.type;
  const ext = (file.name || "").split(".").pop().toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  return "";
}

// One shared form: used for uploading (initial=null) and editing (initial=doc).
function DocumentForm({ athleteId, documentTypes, initial = null, onDone, onCancel }) {
  const editing = !!initial;
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [typeId, setTypeId] = React.useState(initial ? String(initial.documentTypeId) : "");
  const [label, setLabel] = React.useState(initial?.customLabel || "");
  const [notes, setNotes] = React.useState(initial?.notes || "");
  const [expiresAt, setExpiresAt] = React.useState(initial?.expiresAt ? toDateInput(initial.expiresAt) : "");
  const [file, setFile] = React.useState(null);
  const [fileBase64, setFileBase64] = React.useState("");

  const type = documentTypes.find((t) => String(t.id) === String(typeId));
  const isOther = !!type?.isOther;

  function onFile(event) {
    const picked = event.currentTarget.files?.[0];
    if (!picked) {
      setFile(null);
      setFileBase64("");
      return;
    }
    if (picked.size > MAX_BYTES) {
      setMessage("The file is larger than the 10 MB limit.");
      event.currentTarget.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const b64 = String(reader.result).split(",")[1] || "";
      if (!b64) {
        setMessage("Could not read that file.");
        event.currentTarget.value = "";
        return;
      }
      setFile(picked);
      setFileBase64(b64);
      setMessage("");
    };
    reader.onerror = () => setMessage("Could not read that file.");
    reader.readAsDataURL(picked);
  }

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    if (!typeId) { setMessage("Select a document type."); return; }
    if (isOther && !label.trim()) { setMessage("Enter a label for this Other document."); return; }

    const mime = resolveMime(file);
    const payload = {
      documentTypeId: Number(typeId),
      customLabel: isOther ? label : "",
      notes,
      expiresAt,
    };
    if (editing) {
      payload.id = initial.id;
      if (fileBase64) {
        if (!mime) { setMessage("Attach a PDF, JPG, or PNG file."); return; }
        payload.fileName = file?.name || "";
        payload.base64 = fileBase64;
        payload.mime = mime;
      }
    } else {
      if (!fileBase64 || !mime) { setMessage("Attach a PDF, JPG, or PNG file."); return; }
      payload.fileName = file?.name || "";
      payload.base64 = fileBase64;
      payload.mime = mime;
    }

    setBusy(true);
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const response = await fetch(`/api/athletes/${athleteId}/documents`, {
      method: editing ? "PUT" : "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify(payload),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    setBusy(false);
    if (response && response.ok && !result.error) {
      setMessage(editing ? "Document updated." : "Document uploaded.");
      setFileBase64("");
      setFile(null);
      event.currentTarget.reset();
      onDone();
    } else {
      setMessage(result.error || "The document could not be saved.");
    }
  }

  return (
    <form onSubmit={submit} className={styles.formStack} style={{ marginBottom: "var(--space-4)" }}>
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 220px", minWidth: 0 }}>Document type *
          <select className={styles.fieldControl} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
            <option value="">Select type…</option>
            {documentTypes.map((t) => (
              <option value={t.id} key={t.id}>{t.name}{t.isRequired ? " (required)" : ""}</option>
            ))}
          </select>
        </label>
        {isOther && (
          <label style={{ flex: "1 1 220px", minWidth: 0 }}>Label *
            <input className={styles.fieldControl} type="text" maxLength="60" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. NSO default entry" />
          </label>
        )}
        <label style={{ flex: "1 1 260px", minWidth: 0 }}>{editing ? "Replace file (optional)" : "File *"}
          <input className={styles.fieldControl} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" onChange={onFile} />
        </label>
      </div>
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ flex: "1 1 160px", minWidth: 0 }}>Expires
          <input className={styles.fieldControl} type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        </label>
        <label style={{ flex: "1 1 260px", minWidth: 0 }}>Notes
          <input className={styles.fieldControl} type="text" maxLength="500" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. valid until end of school year" />
        </label>
        <button className={`${styles.primary} ${styles.btnSm}`} disabled={busy}>{busy ? "Saving..." : (editing ? "Save changes" : "Upload")}</button>
        {editing && <button type="button" className={`${styles.secondary} ${styles.btnSm}`} onClick={onCancel}>Cancel</button>}
      </div>
      {message && <p role="status" className={styles.formHint}>{message}</p>}
    </form>
  );
}

export default function AthleteDocuments({ athleteId, documents = [], documentTypes = [], canManage = false, onComplete }) {
  const [editingId, setEditingId] = React.useState(null);
  const [listMsg, setListMsg] = React.useState("");
  const [nowMs, setNowMs] = React.useState(() => Date.now());

  React.useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 60 * 1000);
    return () => window.clearInterval(t);
  }, []);

  const byType = {};
  for (const d of documents) {
    (byType[d.documentTypeId] = byType[d.documentTypeId] || []).push(d);
  }
  const orderedTypes = [...documentTypes].sort(
    (a, b) => (Number(b.isRequired) - Number(a.isRequired)) || (Number(a.sortOrder) - Number(b.sortOrder))
  );
  const editingDoc = documents.find((d) => d.id === editingId) || null;

  async function removeDocument(doc) {
    const name = doc.documentType?.isOther && doc.customLabel ? doc.customLabel : doc.documentType?.name || doc.fileName;
    if (!window.confirm(`Delete "${name}"? This permanently removes the document file and its record.`)) return;
    setListMsg("");
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const response = await fetch(`/api/athletes/${athleteId}/documents/${doc.id}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
    }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    if (response && response.ok && !result.error) {
      onComplete();
    } else {
      setListMsg(result.error || "The document could not be deleted.");
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHeader}>
        <div><p className={styles.eyebrow}>Records</p><h2>Documents</h2></div>
      </div>

      {canManage && <DocumentForm athleteId={athleteId} documentTypes={documentTypes} onDone={onComplete} />}
      {canManage && editingDoc && (
        <DocumentForm
          athleteId={athleteId}
          documentTypes={documentTypes}
          initial={editingDoc}
          onDone={() => { setEditingId(null); onComplete(); }}
          onCancel={() => setEditingId(null)}
        />
      )}

      <h4>Checklist</h4>
      <div className={styles.grid}>
        {orderedTypes.map((t) => {
          const typeDocs = byType[t.id] || [];
          const latest = typeDocs[0];
          return (
            <div key={t.id} className={styles.detailPanel}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                <strong style={{ fontSize: 13 }}>{t.name}</strong>
                {t.isRequired && <span className={`${styles.badge} ${styles.badgePending}`}>Required</span>}
              </div>
              <div style={{ marginTop: 6 }}>
                {typeDocs.length ? (
                  <span className={`${styles.badge} ${styles.badgeActive}`}>Uploaded · {fmtDate(latest.createdAt)}</span>
                ) : (
                  <span className={`${styles.badge} ${styles.badgeMuted}`}>Missing</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <h4 style={{ marginTop: "var(--space-5)" }}>Uploaded documents</h4>
      {listMsg && <p role="status" className={styles.formHint}>{listMsg}</p>}
      {documents.length ? (
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>Document</th><th>Type</th><th>Size</th><th>Uploaded</th><th>Expires</th><th>Actions</th></tr></thead>
            <tbody>
              {documents.map((d) => {
                const type = d.documentType;
                const name = type?.isOther && d.customLabel ? d.customLabel : type?.name || d.fileName;
                const expired = d.expiresAt && new Date(d.expiresAt).getTime() < nowMs;
                return (
                  <tr key={d.id}>
                    <td data-label="Document">
                      <strong>{name}</strong>
                      <small>{d.fileName}</small>
                    </td>
                    <td data-label="Type">{type?.name || "—"}</td>
                    <td data-label="Size">{fmtBytes(d.sizeBytes)}</td>
                    <td data-label="Uploaded">{fmtDate(d.createdAt)}{d.uploader?.email ? <small>{` · ${d.uploader.email}`}</small> : null}</td>
                    <td data-label="Expires">
                      {d.expiresAt ? (
                        <span style={{ color: expired ? "var(--danger)" : "inherit" }}>
                          {fmtDate(d.expiresAt)}{expired ? " · Expired" : ""}
                        </span>
                      ) : "—"}
                    </td>
                    <td data-label="Actions">
                      <a className={`${styles.secondary} ${styles.btnSm}`} href={`/api/athletes/${athleteId}/documents/${d.id}`}>Download</a>
                      <a className={`${styles.secondary} ${styles.btnSm}`} href={`/api/athletes/${athleteId}/documents/${d.id}?inline=1`} target="_blank" rel="noreferrer">Print</a>
                      {canManage && (
                        <>
                          <button type="button" className={styles.btnSm} onClick={() => { setEditingId(d.id); setListMsg(""); }}>Edit</button>
                          <button type="button" className={styles.btnSm} style={{ color: "var(--danger)" }} onClick={() => removeDocument(d)}>Delete</button>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : <p className={styles.empty}>No documents uploaded yet.</p>}
    </section>
  );
}