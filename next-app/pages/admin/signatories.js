import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../../lib/prisma";
import AppShell from "../../components/AppShell";
import styles from "../../styles/Dashboard.module.css";
import { DISPLAY_MODES, REPORT_TYPES, SIGNATORY_ROLES, reportTypeLabel, roleLabel } from "../../lib/signatory-options";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  if (session.user.role !== "admin") return { redirect: { destination: "/dashboard", permanent: false } };

  const rows = await prisma.signatory.findMany({
    orderBy: [{ reportType: "asc" }, { displayOrder: "asc" }, { id: "asc" }],
  });

  return { props: { session, signatories: JSON.parse(JSON.stringify(rows)) } };
}

const EMPTY = {
  reportType: "athlete_record",
  role: "prepared_by",
  printedName: "",
  position: "",
  office: "",
  displayMode: "name_position_line",
  displayOrder: 0,
  effectiveFrom: "",
  effectiveTo: "",
  status: "active",
};

function toForm(row) {
  return {
    reportType: row.reportType,
    role: row.role,
    printedName: row.printedName || "",
    position: row.position || "",
    office: row.office || "",
    displayMode: row.displayMode || "name_position_line",
    displayOrder: row.displayOrder ?? 0,
    effectiveFrom: row.effectiveFrom ? String(row.effectiveFrom).slice(0, 10) : "",
    effectiveTo: row.effectiveTo ? String(row.effectiveTo).slice(0, 10) : "",
    status: row.status,
  };
}

export default function SignatoriesAdmin({ session, signatories: initial = [] }) {
  const [rows, setRows] = React.useState(initial);
  const [addOpen, setAddOpen] = React.useState(false);
  const [addForm, setAddForm] = React.useState(EMPTY);
  const [editingId, setEditingId] = React.useState(null);
  const [editForm, setEditForm] = React.useState(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const [message, setMessage] = React.useState({ kind: "", text: "" });

  async function api(method, body) {
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const response = await fetch("/api/admin/signatories", {
      method,
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify(body),
    }).catch(() => null);
    const result = response ? await response.json().catch(() => ({})) : {};
    return { ok: !!(response && response.ok && !result.error), body: result };
  }

  function upsertLocal(row) {
    setRows((prev) => {
      const idx = prev.findIndex((item) => item.id === row.id);
      const next = idx === -1 ? [...prev, row] : prev.map((item) => (item.id === row.id ? row : item));
      return next.sort((a, b) => a.reportType.localeCompare(b.reportType) || (a.displayOrder - b.displayOrder) || (a.id - b.id));
    });
  }

  async function submitAdd(event) {
    event.preventDefault();
    setSaving(true);
    setMessage({ kind: "", text: "" });
    const result = await api("POST", addForm);
    if (result.ok && result.body.id) {
      upsertLocal(result.body);
      setAddForm(EMPTY);
      setAddOpen(false);
      setMessage({ kind: "success", text: "Signatory added." });
    } else {
      setMessage({ kind: "danger", text: result.body.error || "The signatory could not be added." });
    }
    setSaving(false);
  }

  async function submitEdit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage({ kind: "", text: "" });
    const result = await api("PUT", { id: editingId, ...editForm });
    if (result.ok && result.body.id) {
      upsertLocal(result.body);
      setEditingId(null);
      setMessage({ kind: "success", text: "Signatory updated." });
    } else {
      setMessage({ kind: "danger", text: result.body.error || "The signatory could not be updated." });
    }
    setSaving(false);
  }

  async function toggleStatus(row) {
    const next = row.status === "active" ? "inactive" : "active";
    if (next === "inactive" && typeof window !== "undefined" && !window.confirm(`Deactivate the ${roleLabel(row.role)} signatory for ${reportTypeLabel(row.reportType)}?`)) return;
    setSaving(true);
    setMessage({ kind: "", text: "" });
    const result = await api("PUT", { id: row.id, status: next });
    if (result.ok && result.body.id) {
      upsertLocal(result.body);
      setMessage({ kind: "success", text: next === "active" ? "Signatory activated." : "Signatory deactivated." });
    } else {
      setMessage({ kind: "danger", text: result.body.error || "Could not change the signatory status." });
    }
    setSaving(false);
  }

  const activeTypes = new Set(rows.filter((row) => row.status === "active").map((row) => row.reportType));
  const usingDefaults = REPORT_TYPES.filter((type) => !activeTypes.has(type.key));

  // The standard government chain is Prepared by -> Reviewed by -> Certified
  // Correct. Configuration may vary, but tell the admin when a configured chain
  // is missing one of those roles so an official report is never shipped with an
  // accidental gap.
  const STANDARD_ROLES = ["prepared_by", "reviewed_by", "certified_by"];
  const incompleteChains = [...activeTypes].map((type) => {
    const roles = new Set(rows.filter((row) => row.status === "active" && row.reportType === type).map((row) => row.role));
    const missing = STANDARD_ROLES.filter((role) => !roles.has(role));
    return missing.length ? `${reportTypeLabel(type)}: missing ${missing.map(roleLabel).join(", ")}` : null;
  }).filter(Boolean);

  function formFields(form, setForm) {
    return (
      <div style={{ display: "flex", gap: "var(--space-3)", flexWrap: "wrap", alignItems: "flex-end" }}>
        <label style={{ flex: "1 1 220px", minWidth: 0 }}>Report type *
          <select className={styles.fieldControl} value={form.reportType} onChange={(e) => setForm((f) => ({ ...f, reportType: e.target.value }))}>
            {REPORT_TYPES.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
          </select>
        </label>
        <label style={{ flex: "1 1 180px", minWidth: 0 }}>Signature role *
          <select className={styles.fieldControl} value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
            {SIGNATORY_ROLES.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
          </select>
        </label>
        <label style={{ flex: "1 1 240px", minWidth: 0 }}>Printed name
          <input className={styles.fieldControl} type="text" maxLength="150" value={form.printedName} onChange={(e) => setForm((f) => ({ ...f, printedName: e.target.value }))} placeholder="Official printed name" />
        </label>
        <label style={{ flex: "1 1 240px", minWidth: 0 }}>Position / title
          <input className={styles.fieldControl} type="text" maxLength="150" value={form.position} onChange={(e) => setForm((f) => ({ ...f, position: e.target.value }))} placeholder="e.g. City Sports Development Officer" />
        </label>
        <label style={{ flex: "1 1 220px", minWidth: 0 }}>Office / division
          <input className={styles.fieldControl} type="text" maxLength="150" value={form.office} onChange={(e) => setForm((f) => ({ ...f, office: e.target.value }))} placeholder="Optional" />
        </label>
        <label style={{ flex: "1 1 260px", minWidth: 0 }}>Display
          <select className={styles.fieldControl} value={form.displayMode} onChange={(e) => setForm((f) => ({ ...f, displayMode: e.target.value }))}>
            {DISPLAY_MODES.map((mode) => <option key={mode.key} value={mode.key}>{mode.label}</option>)}
          </select>
        </label>
        <label style={{ flex: "0 0 90px" }}>Order
          <input className={styles.fieldControl} type="number" min="0" max="999" value={form.displayOrder} onChange={(e) => setForm((f) => ({ ...f, displayOrder: Number(e.target.value) || 0 }))} />
        </label>
        <label style={{ flex: "0 0 160px" }}>Effective from
          <input className={styles.fieldControl} type="date" value={form.effectiveFrom} onChange={(e) => setForm((f) => ({ ...f, effectiveFrom: e.target.value }))} />
        </label>
        <label style={{ flex: "0 0 160px" }}>Effective to
          <input className={styles.fieldControl} type="date" value={form.effectiveTo} onChange={(e) => setForm((f) => ({ ...f, effectiveTo: e.target.value }))} />
        </label>
        <label style={{ flex: "0 0 auto", display: "inline-flex", alignItems: "center", gap: "var(--space-2)", alignSelf: "flex-end", fontSize: 13 }}><input type="checkbox" checked={form.status === "active"} onChange={(e) => setForm((f) => ({ ...f, status: e.target.checked ? "active" : "inactive" }))} /> Active</label>
      </div>
    );
  }

  return (
    <>
      <Head><title>Signatories | Administration</title></Head>
      <AppShell session={session} isAdmin eyebrow="Administration" title="Signatories" active="/admin/signatories">
        <div className={styles.pageTitle}><h1>Report signatories</h1></div>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Configuration</p><h2>Signature areas by report type</h2></div>
            {!addOpen && <button type="button" className={styles.secondary} onClick={() => { setAddOpen(true); setMessage({ kind: "", text: "" }); }}>Add signatory</button>}
          </div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>
            These entries control the signature area of newly generated reports. A printed name is configuration only — it never means the person signed, reviewed, or certified a report.
            Report types with no active configuration keep the built-in default chain.
          </p>

          {usingDefaults.length > 0 && (
            <p className={styles.formHint} role="status">
              Using built-in defaults for: {usingDefaults.map((type) => type.label).join(", ")}.
            </p>
          )}

          {incompleteChains.length > 0 && (
            <p className={styles.formHint} role="status">
              Standard chain incomplete for: {incompleteChains.join("; ")}. Configured report types use only their active rows, in display order.
            </p>
          )}

          {addOpen && (
            <form onSubmit={submitAdd} className={styles.formStack} style={{ marginBottom: "var(--space-5)" }}>
              {formFields(addForm, setAddForm)}
              <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
                <button className={styles.primary} disabled={saving}>{saving ? "Saving..." : "Add signatory"}</button>
                <button type="button" className={styles.secondary} onClick={() => { setAddOpen(false); setAddForm(EMPTY); }}>Cancel</button>
              </div>
            </form>
          )}

          {message.text && <p role="status" className={`${styles.fullField} ${message.kind === "success" ? styles.formSuccess : styles.formError}`} style={{ marginBottom: "var(--space-3)" }}>{message.text}</p>}

          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th scope="col">Report type</th><th scope="col">Role</th><th scope="col">Printed name</th><th scope="col">Position</th><th scope="col">Office</th><th scope="col">Display</th><th scope="col">Order</th><th scope="col">Effective</th><th scope="col">Status</th><th scope="col">Actions</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  editingId === row.id ? (
                    <tr key={row.id}>
                      <td colSpan={10}>
                        <form onSubmit={submitEdit} className={styles.formStack}>
                          {formFields(editForm, setEditForm)}
                          <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-3)" }}>
                            <button className={styles.primary} disabled={saving}>{saving ? "Saving..." : "Save"}</button>
                            <button type="button" className={styles.secondary} onClick={() => setEditingId(null)}>Cancel</button>
                          </div>
                        </form>
                      </td>
                    </tr>
                  ) : (
                    <tr key={row.id}>
                      <td data-label="Report type">{reportTypeLabel(row.reportType)}</td>
                      <td data-label="Role">{roleLabel(row.role)}</td>
                      <td data-label="Printed name">{row.printedName || "—"}</td>
                      <td data-label="Position">{row.position || "—"}</td>
                      <td data-label="Office">{row.office || "—"}</td>
                      <td data-label="Display">{DISPLAY_MODES.find((mode) => mode.key === row.displayMode)?.label || row.displayMode}</td>
                      <td data-label="Order">{row.displayOrder}</td>
                      <td data-label="Effective">{(row.effectiveFrom ? String(row.effectiveFrom).slice(0, 10) : "—")} to {(row.effectiveTo ? String(row.effectiveTo).slice(0, 10) : "—")}</td>
                      <td data-label="Status">{row.status === "active" ? "Active" : "Inactive"}</td>
                      <td data-label="Actions">
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
                          <button type="button" className={styles.btnSm} disabled={saving} onClick={() => { setEditingId(row.id); setEditForm(toForm(row)); setMessage({ kind: "", text: "" }); }}>Edit</button>
                          <button type="button" className={styles.btnSm} disabled={saving} onClick={() => toggleStatus(row)}>{row.status === "active" ? "Deactivate" : "Reactivate"}</button>
                        </div>
                      </td>
                    </tr>
                  )
                ))}
                {!rows.length && <tr><td colSpan={10} className={styles.empty}>No signatories configured yet. All reports use the built-in default chain.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </AppShell>
    </>
  );
}
