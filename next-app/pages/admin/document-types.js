import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../../lib/prisma";
import AppShell from "../../components/AppShell";
import styles from "../../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  if (session.user.role !== "admin") return { redirect: { destination: "/dashboard", permanent: false } };

  const types = await prisma.documentType.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { documents: true } } },
  });

  return {
    props: {
      session,
      types: JSON.parse(JSON.stringify(types)),
    },
  };
}

const EMPTY_FORM = { name: "", isRequired: false, isOther: false, sortOrder: 0 };

export default function DocumentTypesAdmin({ session, types: initialTypes = [] }) {
  const [types, setTypes] = React.useState(initialTypes);
  const [addOpen, setAddOpen] = React.useState(false);
  const [addForm, setAddForm] = React.useState(EMPTY_FORM);
  const [editingId, setEditingId] = React.useState(null);
  const [editForm, setEditForm] = React.useState(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState({ kind: "", text: "" });

  async function api(method, body) {
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    return fetch("/api/admin/document-types", {
      method,
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify(body),
    }).then(async (r) => ({ ok: r.ok, body: await r.json().catch(() => ({})) }));
  }

  function upsertLocal(type) {
    setTypes((prev) => {
      const idx = prev.findIndex((t) => t.id === type.id);
      if (idx === -1) return [...prev, type].sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
      const next = prev.slice();
      next[idx] = type;
      return next.sort((a, b) => (a.sortOrder - b.sortOrder) || a.name.localeCompare(b.name));
    });
  }

  async function submitAdd(event) {
    event.preventDefault();
    setSaving(true);
    setMessage({ kind: "", text: "" });
    const result = await api("POST", addForm).catch(() => ({ ok: false, body: {} }));
    if (result.ok && result.body.type) {
      upsertLocal(result.body.type);
      setAddForm(EMPTY_FORM);
      setAddOpen(false);
      setMessage({ kind: "success", text: `Added "${result.body.type.name}".` });
    } else {
      setMessage({ kind: "danger", text: result.body.error || "The document type could not be added." });
    }
    setSaving(false);
  }

  function startEdit(t) {
    setEditingId(t.id);
    setEditForm({ name: t.name, isRequired: t.isRequired, isOther: t.isOther, sortOrder: t.sortOrder });
    setMessage({ kind: "", text: "" });
  }

  async function submitEdit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage({ kind: "", text: "" });
    const result = await api("PUT", { id: editingId, ...editForm }).catch(() => ({ ok: false, body: {} }));
    if (result.ok && result.body.type) {
      upsertLocal(result.body.type);
      setEditingId(null);
      setMessage({ kind: "success", text: "Document type updated." });
    } else {
      setMessage({ kind: "danger", text: result.body.error || "The document type could not be updated." });
    }
    setSaving(false);
  }

  async function toggleStatus(t) {
    setSaving(true);
    setMessage({ kind: "", text: "" });
    const next = t.status === "active" ? "inactive" : "active";
    const result = await api("PUT", { id: t.id, status: next }).catch(() => ({ ok: false, body: {} }));
    if (result.ok && result.body.type) {
      upsertLocal(result.body.type);
      setMessage({ kind: "success", text: result.body.type.status === "active" ? "Document type activated." : "Document type deactivated." });
    } else {
      setMessage({ kind: "danger", text: result.body.error || "Could not change the document type status." });
    }
    setSaving(false);
  }

  return (
    <>
      <Head><title>Document Types | Administration</title></Head>
      <AppShell session={session} isAdmin eyebrow="Administration" title="Document Types" active="/admin/document-types">
        <div className={styles.pageTitle}><h1>Document Types</h1></div>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Catalog</p><h2>Required &amp; optional records</h2></div>
            {!addOpen && <button type="button" className={styles.secondary} onClick={() => { setAddOpen(true); setMessage({ kind: "", text: "" }); }}>Add type</button>}
          </div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>
            The document types available on every Athlete Profile, and which ones the checklist marks as &ldquo;Required&rdquo;.
            Deactivated types stay on already-uploaded documents but are hidden from new uploads.
          </p>

          {addOpen && (
            <form onSubmit={submitAdd} className={styles.formStack} style={{ marginBottom: "var(--space-5)" }}>
              <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap" }}>
                <label style={{ flex: "1 1 260px", minWidth: 0 }}>Name *
                  <input className={styles.fieldControl} type="text" maxLength="100" required value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. NSO Certificate" />
                </label>
                <label style={{ flex: "0 0 auto" }}>Order
                  <input className={styles.fieldControl} type="number" min="0" max="999" value={addForm.sortOrder} onChange={(e) => setAddForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))} />
                </label>
                <label style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "var(--space-2)", alignSelf: "flex-end" }}><input type="checkbox" checked={addForm.isRequired} onChange={(e) => setAddForm((f) => ({ ...f, isRequired: e.target.checked }))} /> Required</label>
                <label style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "var(--space-2)", alignSelf: "flex-end" }}><input type="checkbox" checked={addForm.isOther} onChange={(e) => setAddForm((f) => ({ ...f, isOther: e.target.checked }))} /> Free label</label>
                <button className={styles.primary} disabled={saving}>{saving ? "Saving..." : "Add type"}</button>
                <button type="button" className={styles.secondary} onClick={() => { setAddOpen(false); setAddForm(EMPTY_FORM); }}>Cancel</button>
              </div>
            </form>
          )}

          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Type</th><th>Label</th><th>Required</th><th>Order</th><th>In use</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {types.map((t) => (
                  editingId === t.id ? (
                    <tr key={t.id}>
                      <td colSpan={7}>
                        <form onSubmit={submitEdit} className={styles.formStack}>
                          <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "flex-end" }}>
                            <label style={{ flex: "1 1 240px", minWidth: 0 }}>Name *
                              <input className={styles.fieldControl} type="text" maxLength="100" required value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                            </label>
                            <label style={{ flex: "0 0 auto" }}>Order
                              <input className={styles.fieldControl} type="number" min="0" max="999" value={editForm.sortOrder} onChange={(e) => setEditForm((f) => ({ ...f, sortOrder: Number(e.target.value) || 0 }))} />
                            </label>
                            <label style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "var(--space-2)", alignSelf: "flex-end" }}><input type="checkbox" checked={editForm.isRequired} onChange={(e) => setEditForm((f) => ({ ...f, isRequired: e.target.checked }))} /> Required</label>
                            <label style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "var(--space-2)", alignSelf: "flex-end" }}><input type="checkbox" checked={editForm.isOther} onChange={(e) => setEditForm((f) => ({ ...f, isOther: e.target.checked }))} /> Free label</label>
                            <button className={styles.primary} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
                            <button type="button" className={styles.secondary} onClick={() => setEditingId(null)}>Cancel</button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr key={t.id}>
                      <td data-label="Type"><strong>{t.name}</strong></td>
                      <td data-label="Label">{t.isOther ? <span className={`${styles.badge} ${styles.badgePending}`}>Other · free label</span> : <span className={`${styles.badge} ${styles.badgeMuted}`}>Fixed</span>}</td>
                      <td data-label="Required">{t.isRequired ? <span className={`${styles.badge} ${styles.badgeActive}`}>Required</span> : <span className={`${styles.badge} ${styles.badgeMuted}`}>Optional</span>}</td>
                      <td data-label="Order">{t.sortOrder}</td>
                      <td data-label="In use">{t._count?.documents || 0}</td>
                      <td data-label="Status">{t.status === "active" ? <span className={`${styles.badge} ${styles.badgeActive}`}>Active</span> : <span className={`${styles.badge} ${styles.badgeMuted}`}>Inactive</span>}</td>
                      <td data-label="Actions">
                        <button type="button" className={styles.btnSm} onClick={() => startEdit(t)}>Edit</button>
                        <button type="button" className={styles.btnSm} onClick={() => toggleStatus(t)} disabled={saving}>
                          {t.status === "active" ? "Deactivate" : "Activate"}
                        </button>
                      </td>
                    </tr>
                  )
                ))}
                {!types.length && (
                  <tr><td colSpan={7}><p className={styles.empty}>No document types yet. Add the first one above.</p></td></tr>
                )}
              </tbody>
            </table>
          </div>

          {message.text && (
            <p role="status" className={`${styles.formHint} ${message.kind === "success" ? styles.formSuccess : styles.formError}`} style={{ marginTop: "var(--space-4)" }}>
              {message.text}
            </p>
          )}
        </section>
      </AppShell>
    </>
  );
}