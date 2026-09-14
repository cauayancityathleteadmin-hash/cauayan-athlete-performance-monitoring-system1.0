import Head from "next/head";
import { useRouter } from "next/router";
import React from "react";
import { getSession } from "next-auth/react";
import { ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import AppShell from "../../components/AppShell";
import styles from "../../styles/Dashboard.module.css";

function percentColor(p) {
  if (p == null) return "#64748b";
  if (p >= 80) return "#2dd4a8";
  if (p >= 50) return "#fbbf24";
  return "#f87171";
}

const chartTooltip = {
  contentStyle: { background: "#06261e", border: "1px solid rgba(45,212,168,.35)", borderRadius: 8, fontSize: 12 },
  labelStyle: { color: "#e7f7f1", fontWeight: 700 },
  itemStyle: { color: "#9db6c7" },
};

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  return { props: { session, isAdmin: session.user.role === "admin" } };
}

export default function ProgressRoster({ session, isAdmin }) {
  const router = useRouter();
  const [roster, setRoster] = React.useState(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    fetch("/api/progress?roster=1")
      .then((r) => (r.ok ? r.json() : {}))
      .then((json) => { if (json.roster) setRoster(json.roster); else setError(json.error || "Could not load roster progress."); })
      .catch(() => setError("Unable to reach the server."));
  }, []);

  const rows = roster || [];
  const chartData = rows.slice(0, 25).map((r) => ({ name: `${r.athlete}`, full: `${r.athlete} — ${r.planName}`, percent: r.completionPercent, total: r.total }));

  return (
    <>
      <Head><title>Progress Overview | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Training" title="Progress overview" active="/progress">
        <div className={styles.pageActions}>
          <span className={styles.eyebrow}>Training / Progress</span>
          <span className={styles.formHint}>Latest progress for every athlete across your training plans.</span>
        </div>

        {error && <p role="status" className={styles.empty}>{error}</p>}

        {rows.length > 0 && (
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Completion</p><h2>Completion by athlete</h2></div></div>
            {chartData.length ? (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={chartData} margin={{ top: 6, right: 10, left: 16, bottom: 70 }}>
                  <CartesianGrid stroke="rgba(127,199,175,0.12)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: "#9db6c7", fontSize: 11 }} angle={-35} textAnchor="end" height={60} interval={0} />
                  <YAxis domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tick={{ fill: "#9db6c7", fontSize: 12 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip {...chartTooltip} formatter={(v) => [`${v}%`, "Completion"]} labelFormatter={(l, p) => p?.[0]?.payload?.full || l} cursor={{ fill: "rgba(45,212,168,0.08)" }} />
                  <Bar dataKey="percent" radius={[4, 4, 0, 0]}>{chartData.map((d) => <Cell key={d.full} fill={percentColor(d.percent)} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className={styles.empty}>Nothing to chart yet.</p>}
          </section>
        )}

        <section className={styles.panel}>
          <div className={styles.panelHeader}><div><p className={styles.eyebrow}>Roster</p><h2>Every athlete&apos;s latest progress</h2></div></div>
          {rows.length === 0 && !error ? (
            <p className={styles.empty}>{roster ? "No athletes on your training plans yet." : "Loading roster progress..."}</p>
          ) : rows.length > 0 ? (
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Athlete</th>
                    <th>Plan</th>
                    <th>Planned</th>
                    <th>Done</th>
                    <th>Partial</th>
                    <th>Missed</th>
                    <th>Completion</th>
                    <th>Avg score</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.athleteId}:${r.planId}`}>
                      <td data-label="Athlete"><strong>{r.athlete}</strong><small> · {r.athleteCode}</small></td>
                      <td data-label="Plan">{r.planName}</td>
                      <td data-label="Planned" style={{ textAlign: "center" }}>{r.total}</td>
                      <td data-label="Done" style={{ textAlign: "center" }}><strong style={{ color: "var(--accent)" }}>{r.completed}</strong></td>
                      <td data-label="Partial" style={{ textAlign: "center" }}><span style={{ color: "#ffc107" }}>{r.partial}</span></td>
                      <td data-label="Missed" style={{ textAlign: "center" }}><span style={{ color: r.missed > 0 ? "#f87171" : "var(--muted)" }}>{r.missed}</span></td>
                      <td data-label="Completion" style={{ textAlign: "center" }}><strong style={{ color: percentColor(r.completionPercent) }}>{r.completionPercent}%</strong></td>
                      <td data-label="Avg score" style={{ textAlign: "center" }}>{r.averageScore != null ? r.averageScore : "—"}</td>
                      <td><button className={styles.secondary} onClick={() => router.push(`/training-plans/${r.planId}/athletes/${r.athleteId}`)}>View</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>
      </AppShell>
    </>
  );
}