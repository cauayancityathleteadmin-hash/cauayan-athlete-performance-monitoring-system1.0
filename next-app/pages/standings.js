import Head from "next/head";
import Link from "next/link";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../lib/prisma";
import { computeTotalPoints, medalCounts } from "../lib/points";
import AppShell from "../components/AppShell";
import styles from "../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const isAdmin = session.user.role === "admin";

  try {
    let coachId = null;
  if (!isAdmin) {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    coachId = coach?.id ?? null;
  }

  const where = coachId ? { status: "active", coachId } : { status: "active" };

  const [athletes, pointsConfig, sports] = await Promise.all([
    prisma.athlete.findMany({
      where,
      select: {
        id: true,
        athleteCode: true,
        firstName: true,
        middleName: true,
        lastName: true,
        sportId: true,
        sport: { select: { sportName: true } },
        coach: { select: { firstName: true, lastName: true } },
        school: { select: { schoolName: true } },
        achievements: { select: { medal: true, level: true, achievementTitle: true } },
      },
      orderBy: { lastName: "asc" },
    }),
    prisma.pointsConfig.findMany(),
    prisma.sport.findMany({ where: { status: "active" }, select: { id: true, sportName: true }, orderBy: { sportName: "asc" } }),
  ]);

  const standings = athletes.map((athlete) => {
    const points = computeTotalPoints(athlete.achievements, pointsConfig);
    const medals = medalCounts(athlete.achievements);
    return {
      id: athlete.id,
      athleteCode: athlete.athleteCode,
      name: `${athlete.firstName} ${athlete.middleName ? athlete.middleName + " " : ""}${athlete.lastName}`,
      sport: athlete.sport?.sportName || "—",
      sportId: athlete.sportId,
      coach: athlete.coach ? `${athlete.coach.firstName} ${athlete.coach.lastName}` : "—",
      school: athlete.school?.schoolName || "—",
      awardCount: athlete.achievements.length,
      points,
      medals,
    };
  });

  return {
    props: {
      session,
      isAdmin,
      standings: JSON.parse(JSON.stringify(standings)),
      sports: JSON.parse(JSON.stringify(sports)),
      coachScoped: !!coachId,
    },
  };
  } catch (e) {
    console.error("[standings] GSSP error:", e);
    return { props: { session, isAdmin, standings: [], sports: [], coachScoped: false, diagnostics: String((e && (e.message || e)) || e), diagnosticsStack: String((e && e.stack) || "") } };
  }
}

function medalChip(type, count) {
  if (!count) return null;
  const color = type === "gold" ? "#facc15" : type === "silver" ? "#cbd5e1" : type === "bronze" ? "#d97706" : "var(--muted)";
  return (
    <span key={type} style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: 10, background: "rgba(6,38,30,.35)", border: "1px solid var(--border)", fontSize: 11, fontWeight: 700 }}>
      <span style={{ color, fontSize: 12 }}>●</span> {type.charAt(0).toUpperCase()}{type.slice(1)} {count}
    </span>
  );
}

export default function Standings({ session, isAdmin, standings, sports, coachScoped, diagnostics, diagnosticsStack }) {
  const [sportId, setSportId] = React.useState("");
  const filtered = sportId ? standings.filter((s) => s.sportId === Number(sportId)) : standings;
  const ranked = [...filtered].sort((a, b) => b.points - a.points || b.awardCount - a.awardCount);
  const totalPoints = ranked.reduce((s, a) => s + a.points, 0);

  return (
    <>
      <Head><title>Standings | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Recognition" title="Standings" active="/standings">
        <section className={styles.panel}>
          {diagnostics && (
            <div style={{ marginBottom: 16, padding: 14, borderRadius: 8, border: "1px solid #ef4444", background: "rgba(248,113,113,.12)", color: "#fca5a5", fontFamily: "monospace", fontSize: 12, whiteSpace: "pre-wrap" }}>
              DIAGNOSTICS: {diagnostics}
              {"\n\n"}{diagnosticsStack || ""}
            </div>
          )}
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>{coachScoped ? "My athletes" : "All athletes"}</p><h2>Medal &amp; points leaderboard</h2></div>
          </div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>Athletes are ranked by total points from their achievements (medal × competition level). Points update the moment an achievement is saved.</p>

          <div className={styles.toolbar}>
            <label style={{ minWidth: 240 }}>Filter by sport
              <select value={sportId} onChange={(e) => setSportId(e.target.value)}>
                <option value="">All sports</option>
                {sports.map((s) => <option key={s.id} value={s.id}>{s.sportName}</option>)}
              </select>
            </label>
            <span style={{ flex: 1 }} />
            <span className={styles.formHint}>{ranked.length} athlete{ranked.length === 1 ? "" : "s"} · {totalPoints} total points</span>
          </div>

          {ranked.length ? (
            <div className={styles.tableWrap}><table>
              <thead>
                <tr><th>Rank</th><th>Athlete</th><th>Sport</th><th>Coach</th><th>School</th><th>Achievements</th><th>Medals</th><th>Points</th></tr>
              </thead>
              <tbody>
                {ranked.map((a, i) => {
                  const medal = i === 0 ? "#facc15" : i === 1 ? "#cbd5e1" : i === 2 ? "#d97706" : null;
                  return (
                    <tr key={a.id}>
                      <td>
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%", fontWeight: 800, fontSize: 13, background: medal ? medal : "rgba(127,199,175,.12)", color: medal ? "#041f18" : "var(--muted)" }}>{i + 1}</span>
                      </td>
                      <td><Link href={`/athletes/${a.id}/progress`} style={{ fontWeight: 700 }}>{a.name}</Link><small>{a.athleteCode}</small></td>
                      <td>{a.sport}</td>
                      <td>{a.coach}</td>
                      <td>{a.school}</td>
                      <td>{a.awardCount}</td>
                      <td><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{["gold", "silver", "bronze"].map((t) => medalChip(t, a.medals[t]))}</div></td>
                      <td><strong style={{ color: "var(--accent)", fontSize: 16 }}>{a.points}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          ) : <p className={styles.empty}>No athletes with points to rank yet. Record achievements with a medal and level to see standings.</p>}
        </section>
      </AppShell>
    </>
  );
}
