import Head from "next/head";
import Link from "next/link";
import React from "react";
import { getSession } from "next-auth/react";
import { prisma } from "../lib/prisma";
import { gsspData } from "../lib/gssp-cache";
import { computeTotalPoints, medalCounts, rankStandings, rankByMedals, bestLevel, LEVEL_LABELS } from "../lib/points";
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
        bestLevel: bestLevel(achievements),
        hasRecord: achievements.some((a) => a.isRecord),
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

const MEDAL_COLORS = { gold: "#facc15", silver: "#cbd5e1", bronze: "#d97706", fourth: "#a3a3a3", participation: "var(--muted)" };

function medalChip(type, count, key) {
  if (!count) return null;
  const color = MEDAL_COLORS[type] || "var(--muted)";
  return (
    <span key={key || type} style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: "2px 8px", borderRadius: "var(--radius-xl)", background: "rgba(6,38,30,.35)", border: "1px solid var(--border)", fontSize: 11, fontWeight: 700 }}>
      <span style={{ color, fontSize: 12 }}>●</span> {type.charAt(0).toUpperCase()}{type.slice(1)} {count}
    </span>
  );
}

function rankBubble(rank) {
  const medalColor = rank === 1 ? "#facc15" : rank === 2 ? "#cbd5e1" : rank === 3 ? "#d97706" : null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 26, height: 26, borderRadius: "50%", fontWeight: 800, fontSize: 13, background: medalColor ? medalColor : "rgba(127,199,175,.12)", color: medalColor ? "#041f18" : "var(--muted)" }}>{rank}</span>
  );
}

function podiumCard(row, isSchool, key) {
  const color = row.rank === 1 ? "#facc15" : row.rank === 2 ? "#cbd5e1" : "#d97706";
  const meta = isSchool
    ? `${row.athletes} athlete${row.athletes === 1 ? "" : "s"}`
    : `${row.sport} · ${row.school}`;
  const content = (
    <>
      <span className={styles.podiumPlace} style={{ background: color }}>{row.rank}</span>
      <span className={styles.podiumName}>{row.name}{row.hasRecord ? <span title="Record holder" style={{ color: "#fbbf24", marginLeft: 6 }}>★</span> : null}</span>
      <small className={styles.podiumMeta}>{meta}</small>
      <div className={styles.podiumMedals}>{["gold", "silver", "bronze", "fourth"].map((t) => medalChip(t, row[t], t))}</div>
      <strong className={styles.podiumPoints}>{row.points} pts</strong>
    </>
  );
  return row.id
    ? <Link key={key} href={`/standings/${row.id}`} className={styles.podiumCard}>{content}</Link>
    : <div key={key} className={styles.podiumCard}>{content}</div>;
}

export default function Standings({ session, isAdmin, standings, sports, coachScoped }) {
  // Default to first sport (per-sport default ranking)
  const defaultSportId = sports.length ? String(sports[0].id) : "";
  const [sportId, setSportId] = React.useState(defaultSportId);
  const [view, setView] = React.useState("points"); // "points" | "medals"
  const [scope, setScope] = React.useState("athletes"); // "athletes" | "schools"

  const bySport = sportId ? standings.filter((s) => s.sportId === Number(sportId)) : standings;

  // Rank within the current filter, using the selected system (shared ranks).
  const rankedAthletes = view === "medals" ? rankByMedals(bySport) : rankStandings(bySport);

  // Secondary tab: standings by school (Palaro-style delegation tally).
  const schools = React.useMemo(() => {
    const map = new Map();
    for (const a of bySport) {
      const key = a.school || "—";
      const row = map.get(key) || { name: key, gold: 0, silver: 0, bronze: 0, fourth: 0, points: 0, athletes: 0 };
      row.gold += a.gold;
      row.silver += a.silver;
      row.bronze += a.bronze;
      row.fourth += a.fourth;
      row.points += a.points;
      row.athletes += 1;
      map.set(key, row);
    }
    return rankByMedals([...map.values()]);
  }, [bySport]);

  const isSchool = scope === "schools";
  const activeList = isSchool ? schools : rankedAthletes;
  const totalPoints = activeList.reduce((s, a) => s + (a.points || 0), 0);
  const podium = activeList.filter((a) => a.rank >= 1 && a.rank <= 3).slice(0, 3);
  const unit = isSchool ? "school" : "athlete";

  return (
    <>
      <Head><title>Standing | Cauayan Athlete Performance</title></Head>
      <AppShell session={session} isAdmin={isAdmin} eyebrow="Recognition" title="Standing" active="/standings">
        <div className={styles.pageTitle}><h1>Standing</h1></div>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div><p className={styles.eyebrow}>{coachScoped ? "My athletes" : "All athletes"}</p><h2>Medal &amp; points leaderboard</h2></div>
          </div>
          <p className={styles.formHint} style={{ marginTop: 0 }}>Ranked by achievements (medal × competition level × event type). “By Points” is our scoring total; “By Medals” uses the Olympic gold-first system, the way Palaro ranks delegations. Ties share rank and break by gold → silver → bronze → 4th → most recent.</p>

          <div className={styles.toolbar}>
            <label className={styles.searchLabel}>Filter by sport
              <select value={sportId} onChange={(e) => setSportId(e.target.value)}>
                <option value="">All sports</option>
                {sports.map((s) => <option key={s.id} value={s.id}>{s.sportName}</option>)}
              </select>
            </label>
            <div className={styles.segmented} role="group" aria-label="Ranking system">
              <button type="button" className={view === "points" ? `${styles.primary} ${styles.btnSm}` : styles.secondary} aria-pressed={view === "points"} onClick={() => setView("points")}>By Points</button>
              <button type="button" className={view === "medals" ? `${styles.primary} ${styles.btnSm}` : styles.secondary} aria-pressed={view === "medals"} onClick={() => setView("medals")}>By Medals</button>
            </div>
            <div className={styles.segmented} role="group" aria-label="Ranking scope">
              <button type="button" className={scope === "athletes" ? `${styles.primary} ${styles.btnSm}` : styles.secondary} aria-pressed={scope === "athletes"} onClick={() => setScope("athletes")}>Athletes</button>
              <button type="button" className={scope === "schools" ? `${styles.primary} ${styles.btnSm}` : styles.secondary} aria-pressed={scope === "schools"} onClick={() => setScope("schools")}>By School</button>
            </div>
            <span className={styles.toolbarSpacer} />
            <span className={styles.formHint}>{activeList.length} {unit}{activeList.length === 1 ? "" : "s"} · {totalPoints} total points</span>
          </div>

          {podium.length ? <div className={styles.podiumRow}>{podium.map((row) => podiumCard(row, isSchool, isSchool ? row.name : row.id))}</div> : null}

          {activeList.length ? (
            <div className={styles.tableWrap}><table>
              {isSchool ? (
                <>
                  <thead>
                    <tr><th scope="col">Rank</th><th scope="col">School</th><th scope="col">Athletes</th><th scope="col">Gold</th><th scope="col">Silver</th><th scope="col">Bronze</th><th scope="col">4th</th><th scope="col">Points</th></tr>
                  </thead>
                  <tbody>
                    {activeList.map((row) => (
                      <tr key={row.name}>
                        <td data-label="Rank">{rankBubble(row.rank)}</td>
                        <td data-label="School"><strong>{row.name}</strong></td>
                        <td data-label="Athletes">{row.athletes}</td>
                        <td data-label="Gold"><strong style={{ color: MEDAL_COLORS.gold }}>{row.gold}</strong></td>
                        <td data-label="Silver"><strong style={{ color: MEDAL_COLORS.silver }}>{row.silver}</strong></td>
                        <td data-label="Bronze"><strong style={{ color: MEDAL_COLORS.bronze }}>{row.bronze}</strong></td>
                        <td data-label="4th">{row.fourth}</td>
                        <td data-label="Points"><strong style={{ color: "var(--accent)", fontSize: 16 }}>{row.points}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </>
              ) : (
                <>
                  <thead>
                    <tr><th scope="col">Rank</th><th scope="col">Athlete</th><th scope="col">Sport</th><th scope="col">Coach</th><th scope="col">School</th><th scope="col">Level</th><th scope="col">Achievements</th><th scope="col">Medals</th><th scope="col">Points</th></tr>
                  </thead>
                  <tbody>
                    {activeList.map((a) => (
                      <tr key={a.id}>
                        <td data-label="Rank">{rankBubble(a.rank)}</td>
                        <td data-label="Athlete"><Link href={`/standings/${a.id}`} style={{ fontWeight: 700 }}>{a.name}</Link>{a.hasRecord ? <span title="Record holder" style={{ color: "#fbbf24", marginLeft: 6 }}>★</span> : null}<small>{a.athleteCode}</small></td>
                        <td data-label="Sport">{a.sport}</td>
                        <td data-label="Coach">{a.coach}</td>
                        <td data-label="School">{a.school}</td>
                        <td data-label="Level">{a.bestLevel ? <span className={styles.badge} style={{ background: "rgba(45,212,168,.14)", color: "var(--accent)" }}>{LEVEL_LABELS[a.bestLevel] || a.bestLevel}</span> : "—"}</td>
                        <td data-label="Achievements">{a.awardCount}</td>
                        <td data-label="Medals"><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{["gold", "silver", "bronze", "fourth"].map((t) => medalChip(t, a[t], t))}</div></td>
                        <td data-label="Points"><strong style={{ color: "var(--accent)", fontSize: 16 }}>{a.points}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </>
              )}
            </table></div>
          ) : <p className={styles.empty}>No athletes with points to rank yet. Record achievements with a medal and level to see standings.</p>}
        </section>
      </AppShell>
    </>
  );
}
