import React from "react";
import styles from "../styles/Dashboard.module.css";

const SEARCHABLE = ["athleteCode", "firstName", "lastName", "middleName", "suffix"];

function matchesQuery(athlete, query) {
  for (const key of SEARCHABLE) {
    const value = athlete[key];
    if (typeof value === "string" && value.toLowerCase().includes(query)) return true;
  }
  if (athlete.sport?.sportName?.toLowerCase().includes(query)) return true;
  if (athlete.event?.eventName?.toLowerCase().includes(query)) return true;
  if (athlete.coach) {
    if (String(athlete.coach.coachCode || "").toLowerCase().includes(query)) return true;
    if (`${athlete.coach.firstName} ${athlete.coach.lastName}`.toLowerCase().includes(query)) return true;
  }
  return false;
}

export default function AthletePickList({
  athletes = [],
  selected = new Set(),
  onToggle,
  onToggleAll,
  nameCell,
  searchPlaceholder = "Search athletes…",
  emptyText = "No athletes to pick.",
  showSport = true,
  showCoach = true,
}) {
  const [search, setSearch] = React.useState("");
  const [expandedGroups, setExpandedGroups] = React.useState(new Set());

  const query = search.trim().toLowerCase();

  // Group athletes by sport (A-Z, "Unassigned" for athletes without a sport)
  const groupedAthletes = React.useMemo(() => {
    const map = new Map();
    for (const athlete of athletes) {
      const sport = athlete.sport?.sportName || "Unassigned";
      if (!map.has(sport)) map.set(sport, []);
      map.get(sport).push(athlete);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [athletes]);

  // Per-group data: total count, search matches, and effective expansion
  const groupData = React.useMemo(() => {
    return groupedAthletes.map(([sport, groupAthletes]) => {
      const matches = query ? groupAthletes.filter((a) => matchesQuery(a, query)) : groupAthletes;
      const isExpanded = expandedGroups.has(sport);
      // Collapsed groups auto-expand while a search matches athletes inside them
      const effectiveExpanded = isExpanded || (query !== "" && matches.length > 0);
      return { sport, total: groupAthletes.length, matches, isExpanded, effectiveExpanded };
    });
  }, [groupedAthletes, query, expandedGroups]);

  const anyMatch = groupData.some((g) => g.matches.length > 0);

  // Athletes currently visible in the table (only expanded groups contribute rows)
  const visibleAthletes = React.useMemo(() => {
    const result = [];
    for (const g of groupData) {
      if (g.effectiveExpanded) result.push(...g.matches);
    }
    return result;
  }, [groupData]);

  const allChecked = visibleAthletes.length > 0 && visibleAthletes.every((athlete) => selected.has(athlete.id));

  function toggleGroup(sport) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(sport)) next.delete(sport);
      else next.add(sport);
      return next;
    });
  }

  if (!athletes.length) return <p className={styles.empty}>{emptyText}</p>;

  return (
    <div>
      <div className={styles.toolbar}>
        <label className={styles.searchLabel}>
          Search athletes
          <input
            type="text"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <span className={styles.formHint} style={{ alignSelf: "center" }}>
          {selected.size} selected
        </span>
      </div>

      {query !== "" && !anyMatch ? (
        <p className={styles.empty}>No athletes matching your criteria.</p>
      ) : (
        <div className={styles.tableWrap} style={{ marginTop: "var(--space-3)" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={allChecked}
                    onChange={() => onToggleAll(visibleAthletes.map((a) => a.id))}
                    aria-label="Select all displayed athletes"
                  />
                </th>
                <th>Code</th>
                <th>Athlete</th>
                {showSport && <th>Sport / event</th>}
                {showCoach && <th>Current coach</th>}
              </tr>
            </thead>
            <tbody>
              {groupData.map((g, gi) => {
                const headerRow = (
                  <tr
                    key={`header-${gi}`}
                    style={{
                      cursor: "pointer",
                      background: "rgba(45,212,168,.04)",
                      borderBottom: "1px solid var(--border)"
                    }}
                    onClick={() => toggleGroup(g.sport)}
                  >
                    <td colSpan={showSport && showCoach ? 5 : showSport || showCoach ? 4 : 3} style={{ padding: "var(--space-3) var(--space-4)", color: "var(--muted)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-2)" }}>
                        <span style={{
                          background: "rgba(45,212,168,.12)",
                          color: "var(--accent)",
                          borderRadius: "var(--radius-full)",
                          padding: "var(--space-1) var(--space-2)",
                          fontSize: "var(--text-xs)",
                          fontWeight: 700
                        }}>
                          {g.total}
                        </span>
                        <span style={{ fontSize: 12, color: "var(--muted)" }} aria-hidden="true">
                          {g.effectiveExpanded ? "\u25BE" : "\u25B8"}
                        </span>
                        <span>{g.sport}</span>
                        {query !== "" && g.matches.length > 0 && (
                          <small className={styles.formHint}>
                            ({g.matches.length} match{g.matches.length === 1 ? "" : "es"})
                          </small>
                        )}
                      </span>
                    </td>
                  </tr>
                );

                const athleteRows = g.effectiveExpanded
                  ? g.matches.map((athlete, ai) => {
                      const checked = selected.has(athlete.id);
                      return (
                        <tr
                          key={`row-${gi}-${ai}`}
                          style={{ opacity: checked ? 1 : 0.82, borderBottom: "1px solid var(--border)" }}
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => onToggle(athlete.id)}
                              aria-label={`Select ${athlete.firstName} ${athlete.lastName}`}
                            />
                          </td>
                          <td data-label="Code">{athlete.athleteCode}</td>
                          <td data-label="Athlete">
                            {nameCell ? nameCell(athlete) : (
                              <span style={{ fontWeight: 700 }}>
                                {athlete.firstName} {athlete.middleName || ""} {athlete.lastName}
                              </span>
                            )}
                          </td>
                          {showSport && <td data-label="Sport / event">
                            {athlete.sport?.sportName || "Unassigned"}
                            <small>{athlete.event?.eventName || ""}</small>
                          </td>}
                          {showCoach && <td data-label="Current coach">
                            {athlete.coach ? `${athlete.coach.firstName} ${athlete.coach.lastName}` : "Unassigned"}
                          </td>}
                        </tr>
                      );
                    })
                  : [];

                return [headerRow, ...athleteRows];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}