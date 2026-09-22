import Head from "next/head";
import Link from "next/link";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../lib/prisma";
import { gsspData } from "../lib/gssp-cache";
import { computeTotalPoints, medalCounts, rankStandings } from "../lib/points";
import AppShell from "../components/AppShell";
import styles from "../styles/Dashboard.module.css";

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) return { redirect: { destination: "/login", permanent: false } };
  const isAdmin = session.user.role === "admin";

  let coachId = null;
  if (!isAdmin) {
    const coach = await prisma.coach.findUnique({ where: { userId: Number(session.user.id) }, select: { id: true } });
    coachId = coach?.id ?? null;
  }

  const where = coachId ? { status: "active", coachId } : { status: "active" };

  const payload = await gsspData(`standing:${isAdmin ? "a" : (coachId ? `c:${coachId}` : "none")}`, 30000, async () => {
    const [athletes, sports] = await Promise.all([
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
          achievements: { select: { medal: true, level: true, isRecord: true, achievementTitle: true, achievementDate: true, event: { select: { eventCategory: true } } } },
        },
        orderBy: { lastName: "asc" },
      }),
      prisma.sport.findMany({ where: { status: "active" }, select: { id: true, sportName: true }, orderBy: { sportName: "asc" } }),
    ]);

    // First compute per-athlete aggregates for ranking
    const enriched = athletes.map((athlete) => {
      const achievements = athlete.achievements || [];
      const points = computeTotalPoints(achievements);
      const medals = medalCounts(achievements);
      // Most recent achievement date for tiebreak
      const dates = achievements.map((a) => a.achievementDate).filter(Boolean);
      const mostRecentDate = dates.length ? new Date(Math.max(...dates.map((d) => new Date(d).getTime()))).toISOString() : null;
      return {
        id: athlete.id,
        athleteCode: athlete.athleteCode,
        name: `${athlete.firstName} ${athlete.middleName ? athlete.middleName + " " : ""}${athlete.lastName}`,
        sport: athlete.sport?.sportName || "—",
        sportId: athlete.sportId,
        coach: athlete.coach ? `${athlete.coach.firstName} ${athlete.coach.lastName}` : "—",
        school: athlete.school?.schoolName || "—",
        awardCount: achievements.length,
        points,
        gold: medals.gold,
        silver: medals.silver,
        bronze: medals.bronze,
        fourth: medals.fourth,
        participation: medals.participation,
        mostRecentDate,
      };
    });

    // Apply ranking with shared ranks + tiebreak (gold→silver→bronze→fourth→recency→name)
    const ranked = rankStandings(enriched);

    return {
      standings: JSON.parse(JSON.stringify(ranked)),
      sports: JSON.parse(JSON.stringify(sports)),
      coachScoped: !!coachId,
    };
  });

  return {
    props: {
      session,
      isAdmin,
      ...payload,
    },
  };
}

function medalChip(type, count) {
  if (!count) return null;
  const color = type === "gold" ? "#facc15" : type === "silver" ? "#cbd5e1" : type === "bronze" ? "#d97706" : type === "fourth" ? "#a3a3a3" : "var(--muted)";
  return (
    <span key={type} style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: "var(--radius-xl)", background: "rgba(6,38,30,.35)", border: "1px solid var(--border)", fontSize: 11, fontWeight: 700 }}>
      <span style={{ color, fontSize: 12 }}>●</span> {type.charAt(0).toUpperCase()}{type.slice(1)} {count}
    </span>
  );
}

export default function Standings({ session, isAdmin, standings, sports, coachScoped }) {
  // Default to first sport (per-sport default ranking)
  const defaultSportId = sports.length ? String(sports[0].id) : "";
  const [sportId, setSportId] = React.useState(defaultSportId);
  const filtered = sportId ? standings.filter((s) => s.sportId === Number(sportId)) : standings;
  const totalPoints = filtered.reduce((s, a) => s + a.points, 0);

  return (
    <>
      <Head><title>Standing | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Recognition" title="Standing" active="/standings">
        <div className={styles.pageTitle}><h1>Standing</h1></div>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>{coachScoped ? "My athletes" : "All athletes"}</p><h2>Medal & points leaderboard</h2></div>
          </div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>Athletes are ranked by total points from their achievements (medal × competition level × event type). Points update the moment an achievement is saved. Ties share rank and break by gold → silver → bronze → 4th → most recent.</p>

          <div className={styles.toolbar}>
            <label className={styles.searchLabel}>Filter by sport
              <select value={sportId} onChange={(e) => setSportId(e.target.value)}>
                <option value="">All sports</option>
                {sports.map((s) => <option key={s.id} value={s.id}>{s.sportName}</option>)}
              </select>
            </label>
            <span className={styles.toolbarSpacer} />
            <span className={styles.formHint}>{filtered.length} athlete{filtered.length === 1 ? "" : "s"} · {totalPoints} total points</span>
          </div>

          {filtered.length ? (
            <div className={styles.tableWrap}><table>
              <thead>
                <tr><th>Rank</th><th>Athlete</th><th>Sport</th><th>Coach</th><th>School</th><th>Achievements</th><th>Medals</th><th>Points</th></tr>
              </thead>
              <tbody>
                {filtered.map((a) => {
                  const isPodium = a.rank === 1 || a.rank === 2 || a.rank === 3;
                  const medalColor = a.rank === 1 ? "#facc15" : a.rank === 2 ? "#cbd5e1" : a.rank === 3 ? "#d97706" : null;
                  return (
                    <tr key={a.id}>
                      <td data-label="Rank">
                        <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%", fontWeight: 800, fontSize: 13, background: medalColor ? medalColor : "rgba(127,199,175,.12)", color: medalColor ? "#041f18" : "var(--muted)" }}>{a.rank}</span>
                      </td>
                      <td data-label="Athlete"><Link href={`/standings/${a.id}`} style={{ fontWeight: 700 }}>{a.name}</Link><small>{a.athleteCode}</small></td>
                      <td data-label="Sport">{a.sport}</td>
                      <td data-label="Coach">{a.coach}</td>
                      <td data-label="School">{a.school}</td>
                      <td data-label="Achievements">{a.awardCount}</td>
                      <td data-label="Medals"><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{["gold", "silver", "bronze", "fourth"].map((t) => medalChip(t, a[t]))}</div></td>
                      <td data-label="Points"><strong style={{ color: "var(--accent)", fontSize: 16 }}>{a.points}</strong></td>
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