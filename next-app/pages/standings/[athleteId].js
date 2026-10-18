import Head from "next/head";
import Link from "next/link";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "@/lib/prisma";
import { gsspData } from "@/lib/gssp-cache";
import { computeAchievementPoints, computeTotalPoints, medalCounts } from "@/lib/points";
import AppShell from "@/components/AppShell";
import styles from "@/styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const isAdmin = session.user.role === "admin";

  const athleteId = Number(context.params?.athleteId);
  if (!athleteId || isNaN(athleteId)) {
    return { notFound: true };
  }

  let coachId = null;
  if (!isAdmin) {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    coachId = coach?.id ?? null;
  }

  // Verify athlete exists and check access
  const athlete = await prisma.athlete.findUnique({
    where: { id: athleteId },
    select: { id: true, athleteCode: true, firstName: true, middleName: true, lastName: true, coachId: true, sportId: true, sport: { select: { sportName: true } }, school: { select: { schoolName: true } }, coach: { select: { firstName: true, lastName: true } } },
  });

  if (!athlete) return { notFound: true };

  // Access control: admin or the athlete's own coach
  if (!isAdmin && (!coachId || athlete.coachId !== coachId)) {
    return { redirect: { destination: "/standings", permanent: false } };
  }

  // Fetch achievements with event category for points calculation
  const achievements = await prisma.achievement.findMany({
    where: { athleteId },
    orderBy: { achievementDate: "desc" },
    select: {
      id: true,
      achievementTitle: true,
      achievementType: true,
      achievementDate: true,
      organization: true,
      description: true,
      medal: true,
      level: true,
      isRecord: true,
      sportId: true,
      sport: { select: { sportName: true } },
      eventId: true,
      event: { select: { eventName: true, eventCategory: true } },
      certificateUrl: true,
    },
  });

  return {
    props: {
      session,
      isAdmin,
      athlete: JSON.parse(JSON.stringify(athlete)),
      achievements: JSON.parse(JSON.stringify(achievements)),
    },
  };
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

function medalBadge(type) {
  const map = { gold: { label: "Gold", color: "#facc15" }, silver: { label: "Silver", color: "#cbd5e1" }, bronze: { label: "Bronze", color: "#d97706" }, fourth: { label: "4th", color: "#a3a3a3" }, participation: { label: "Participation", color: "var(--muted)" } };
  const m = map[type] || { label: type, color: "var(--muted)" };
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: "var(--radius-xl)", background: "rgba(6,38,30,.35)", border: "1px solid var(--border)", fontSize: 11, fontWeight: 700 }}><span style={{ color: m.color, fontSize: 12 }}>●</span> {m.label}</span>;
}

function levelChip(level) {
  const order = { intramural: 1, barangay: 2, city: 3, provincial: 4, regional: 5, national: 6, international: 7 };
  const labels = { intramural: "Intramural", barangay: "Barangay", city: "City / Municipal", provincial: "Provincial", regional: "Regional", national: "National", international: "International" };
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: "var(--radius-xl)", background: "rgba(6,38,30,.35)", border: "1px solid var(--border)", fontSize: 11, fontWeight: 700 }}>{labels[level] || level}</span>;
}

export default function StandingDetail({ session, isAdmin, athlete, achievements }) {
  const athleteName = `${athlete.firstName} ${athlete.middleName ? athlete.middleName + " " : ""}${athlete.lastName}`;

  // Compute per-achievement points
  const achievementsWithPoints = achievements.map((a) => ({
    ...a,
    points: computeAchievementPoints(a),
  }));

  const totalPoints = computeTotalPoints(achievementsWithPoints);
  const medals = medalCounts(achievementsWithPoints);

  return (
    <>
      <Head><title>{athleteName} — Achievements | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Recognition" title="Standing" active="/standings">
        <div className={styles.pageTitle}>
          <h1>{athleteName}</h1>
          <p className={styles.eyebrow}>{athlete.athleteCode} · {athlete.sport?.sportName || "—"} · {athlete.school?.schoolName || "—"}</p>
        </div>

        <section className={styles.panel}>
          <div className={styles.panelHeader} style={{ justifyContent: "space-between", flexWrap: "wrap", gap: "var(--space-3)" }}>
            <div>
              <p className={styles.eyebrow}>Achievements</p>
              <h2>Complete record · {totalPoints} total points</h2>
            </div>
            <Link href="/standings" className={styles.secondary} style={{ alignSelf: "flex-end" }}>
              ← Back to Standing
            </Link>
          </div>

          <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap", marginBottom: "var(--space-4)" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {medals.gold && medalBadge("gold")}
              {medals.silver && medalBadge("silver")}
              {medals.bronze && medalBadge("bronze")}
              {medals.fourth && medalBadge("fourth")}
              {medals.participation && medalBadge("participation")}
            </div>
          </div>

          {achievementsWithPoints.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              {achievementsWithPoints.map((a) => (
                <article key={a.id} className={styles.detailPanel} style={{ position: "relative", padding: "var(--space-5)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <strong style={{ fontSize: 14 }}>{a.achievementTitle}</strong>
                      <span style={{ marginLeft: 8, color: "var(--accent)", fontWeight: 700 }}>{a.points} pts</span>
                      {a.isRecord && <span style={{ marginLeft: 8, color: "#fbbf24", fontSize: 11, fontWeight: 700, background: "rgba(251,191,36,.12)", padding: "1px 6px", borderRadius: "var(--radius-md)" }}>RECORD</span>}
                    </div>
                    <small style={{ color: "var(--muted)", whiteSpace: "nowrap" }}>{fmtDate(a.achievementDate)}</small>
                  </div>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                    {a.medal && medalBadge(a.medal)}
                    {a.level && levelChip(a.level)}
                  </div>

                  {a.achievementType && (
                    <small style={{ display: "block", color: "var(--accent)", fontSize: 12, textTransform: "capitalize", marginTop: 4 }}>{a.achievementType}</small>
                  )}

                  {(a.sport || a.event) && (
                    <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap", color: "var(--muted)", fontSize: 12 }}>
                      {a.sport && <span><strong>Sport:</strong> {a.sport.sportName}</span>}
                      {a.event && <span><strong>Event:</strong> {a.event.eventName} <small style={{ color: "var(--accent)" }}>({a.event.eventCategory})</small></span>}
                    </div>
                  )}

                  {a.organization && <small style={{ display: "block", color: "var(--muted)", fontSize: 12, marginTop: 4 }}><strong>Organization:</strong> {a.organization}</small>}
                  {a.description && <small style={{ display: "block", color: "var(--muted)", fontSize: 12, marginTop: 4 }}><strong>Description:</strong> {a.description}</small>}
                  {a.certificateUrl && <small style={{ display: "block", marginTop: 4 }}><a href={a.certificateUrl} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>View certificate / proof</a></small>}
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>No achievements recorded for this athlete yet.</p>
          )}
        </section>
      </AppShell>
    </>
  );
}