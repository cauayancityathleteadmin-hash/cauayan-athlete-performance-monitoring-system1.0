import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../../lib/prisma";
import AppShell from "../../components/AppShell";
import { STARTER_NORMS, AGE_GROUPS, CLASSIFICATION_TIERS, DEFAULT_STARTER_TIER, getAllTiers, getAgeGroups, updateNorm } from "../../lib/starter-metrics";
import { FITNESS_TYPES, FITNESS_OPTIONS } from "../../lib/training-metrics";
import styles from "../../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  if (session.user.role !== "admin") return { redirect: { destination: "/dashboard", permanent: false } };

  // Check usage of each fitness type in plan_activities
  const usage = await prisma.planActivity.groupBy({
    by: ["fitnessType"],
    _count: { fitnessType: true },
  });
  const usageMap = {};
  for (const u of usage) {
    usageMap[u.fitnessType] = u._count.fitnessType;
  }

  return {
    props: {
      session,
      usageMap: JSON.parse(JSON.stringify(usageMap)),
    },
  };
}

const TIER_LABELS = {
  excellent: "Excellent (5)",
  veryGood: "Very Good (4)",
  good: "Good (3)",
  fair: "Fair (2)",
  needsImprovement: "Needs Improvement (1)",
};

export default function TrainingMetricsAdmin({ session, usageMap = {} }) {
  const [activeType, setActiveType] = React.useState(FITNESS_TYPES[0]);
  const [editingCell, setEditingCell] = React.useState(null);
  const [editValue, setEditValue] = React.useState("");
  const [message, setMessage] = React.useState({ kind: "", text: "" });
  const [saving, setSaving] = React.useState(false);

  const handleEditClick = (fitnessType, sex, ageGroup, tier, currentValue) => {
    setEditingCell({ fitnessType, sex, ageGroup, tier });
    setEditValue(String(currentValue));
  };

  const handleSave = async (fitnessType, sex, ageGroup, tier) => {
    const value = Number(editValue);
    if (!Number.isFinite(value)) {
      setMessage({ kind: "danger", text: "Invalid number." });
      return;
    }
    setSaving(true);
    setMessage({ kind: "", text: "" });
    // Optimistic update
    updateNorm(fitnessType, sex, ageGroup, tier, value);
    // In a real implementation, persist to DB (SystemSetting or dedicated table)
    // For now, we just keep in-memory; a real persist would write to a JSON file or DB table
    setMessage({ kind: "success", text: `Updated ${fitnessType} / ${sex} / ${ageGroup} / ${tier} = ${value}` });
    setEditingCell(null);
    setSaving(false);
  };

  const handleCancel = () => {
    setEditingCell(null);
  };

  const getUsage = (ft) => usageMap[ft] || 0;
  const isUsed = (ft) => getUsage(ft) > 0;

  return (
    <>
      <Head><title>Training Metrics | Administration</title></Head>
      <AppShell session={session} isAdmin eyebrow="Training" title="Metrics Management" active="/admin/training-metrics">
        <div className={styles.pageTitle}><h1>Starter Metrics Management</h1></div>

        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>Reference Norms</p><h2>DepEd PFT-based starter values</h2></div>
          </div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>
            These are the default target suggestions (the <strong>&ldquo;Good&rdquo;</strong> band) pre-filled when coaches create activities.
            Edit values below; changes apply to new activities immediately. Coaches can still override.
            Source: <em>DepEd Order No. 34, s. 2019 &mdash; Revised Physical Fitness Tests Manual</em>.
          </p>

          <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
            {FITNESS_TYPES.map((ft) => (
              <button
                key={ft}
                className={`${styles.btnSm} ${activeType === ft ? styles.primary : styles.secondary}`}
                onClick={() => { setActiveType(ft); setEditingCell(null); }}
                style={{ flex: "1 1 140px" }}
              >
                {FITNESS_OPTIONS.find((o) => o.value === ft)?.label || ft}
                <span className={styles.badge} style={{ marginLeft: 6, background: isUsed(ft) ? "var(--warning)" : "var(--muted)" }}>
                  {getUsage(ft)} in use
                </span>
              </button>
            ))}
          </div>

          <div style={{ overflowX: "auto" }}>
            <table className={styles.tableWrap} style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ position: "sticky", left: 0, zIndex: 1 }}>Sex / Age Group</th>
                  {CLASSIFICATION_TIERS.map((tier) => (
                    <th key={tier}>{TIER_LABELS[tier]}</th>
                  ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {["male", "female"].flatMap((sex) => {
                  const rows = [];
                  rows.push(
                    <tr key={`${sex}-header`} style={{ background: "rgba(45,212,168,0.04)" }}>
                      <td colSpan={CLASSIFICATION_TIERS.length + 2} style={{ fontWeight: 600, color: "var(--accent)" }}>
                        {sex === "male" ? "Male Athletes" : "Female Athletes"}
                        <span className={styles.badge} style={{ marginLeft: "var(--space-3)" }}>{activeType} — {FITNESS_OPTIONS.find((o) => o.value === activeType)?.label}</span>
                      </td>
                    </tr>
                  );
                  for (const ageGroup of AGE_GROUPS) {
                    const tiers = getAllTiers(activeType, sex, ageGroup);
                    if (!tiers) continue;
                    rows.push(
                      <tr key={`${sex}-${ageGroup}`}>
                        <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{ageGroup} years</td>
                        {CLASSIFICATION_TIERS.map((tier) => {
                          const value = tiers[tier];
                          const isEditing = editingCell?.fitnessType === activeType && editingCell.sex === sex && editingCell.ageGroup === ageGroup && editingCell.tier === tier;
                          return (
                            <td key={`${sex}-${ageGroup}-${tier}`}>
                              {isEditing ? (
                                <input
                                  type="number"
                                  step="any"
                                  value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  className={styles.fieldControl}
                                  style={{ width: "100%" }}
                                  autoFocus
                                />
                              ) : (
                                <span style={{ fontWeight: tier === DEFAULT_STARTER_TIER ? 600 : 400 }}>{value}</span>
                              )}
                            </td>
                          );
                        })}
                        <td>
                          {editingCell?.fitnessType === activeType && editingCell.sex === sex && editingCell.ageGroup === ageGroup ? (
                            <div style={{ display: "flex", gap: "var(--space-2)" }}>
                              <button className={`${styles.primary} ${styles.btnSm}`} onClick={() => handleSave(activeType, sex, ageGroup, editingCell.tier)} disabled={saving}>
                                {saving ? "Saving..." : "Save"}
                              </button>
                              <button className={`${styles.secondary} ${styles.btnSm}`} onClick={handleCancel}>Cancel</button>
                            </div>
                          ) : (
                            <button
                              className={styles.btnSm}
                              onClick={() => handleEditClick(activeType, sex, ageGroup, CLASSIFICATION_TIERS[0], tiers[CLASSIFICATION_TIERS[0]])}
                            >
                              Edit row
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  }
                  return rows;
                })}
              </tbody>
            </table>
          </div>

          {message.text && (
            <p role="status" className={`${styles.fullField} ${message.kind === "success" ? styles.formSuccess : styles.formError}`}>
              {message.text}
            </p>
          )}
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Status</p><h2>Fitness type usage</h2></div></div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>
            Fitness types with activities in use cannot be deleted — they can only be disabled (hidden from new activities).
            Unused types can be fully removed.
          </p>
          <div className={styles.tableWrap}><table>
            <thead><tr><th>Fitness Type</th><th>Primary Metric</th><th>Activities Using</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {FITNESS_TYPES.map((ft) => {
                const used = getUsage(ft);
                return (
                  <tr key={ft}>
                    <td data-label="Fitness Type"><strong>{FITNESS_OPTIONS.find((o) => o.value === ft)?.label || ft}</strong></td>
                    <td data-label="Primary Metric">{STARTER_NORMS[ft]?.primaryMetric || "—"}</td>
                    <td data-label="Activities Using">{used}</td>
                    <td data-label="Status">
                      {used > 0 ? (
                        <span className={styles.badge} style={{ background: "rgba(251,191,36,.16)", color: "var(--warning)" }}>
                          In use — disable only
                        </span>
                      ) : (
                        <span className={styles.badge} style={{ background: "rgba(26,92,74,.08)", color: "var(--muted)" }}>
                          Unused — deletable
                        </span>
                      )}
                    </td>
                    <td data-label="Actions">
                      {used > 0 ? (
                        <button className={`${styles.danger} ${styles.btnSm}`} disabled>Disable (not implemented)</button>
                      ) : (
                        <button className={`${styles.danger} ${styles.btnSm}`} disabled>Delete (not implemented)</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </section>

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Notes</p><h2>Implementation notes</h2></div></div>
          <ul style={{ margin: 0, paddingLeft: "var(--space-5)" }}>
            <li>Norm values are stored in <code>lib/starter-metrics.js</code> in-memory; a production implementation should persist to DB (e.g., <code>SystemSetting</code> or dedicated <code>TrainingMetricNorm</code> table).</li>
            <li>The <strong>&ldquo;Good&rdquo;</strong> tier ({DEFAULT_STARTER_TIER}) is used as the default pre-filled target for coaches.</li>
            <li>Age groups follow DepEd PFT manual groupings: {AGE_GROUPS.join(", ")}.</li>
            <li>Sex is derived from athlete <code>gender</code> field (male/female); other/prefer_not_to_say falls back to male norms.</li>
            <li>Source: <em>DepEd Order No. 34, s. 2019</em> &mdash; values here are placeholders needing transcription from the official manual.</li>
          </ul>
        </section>
      </AppShell>
    </>
  );
}