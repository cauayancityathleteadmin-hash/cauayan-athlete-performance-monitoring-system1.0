import React from "react";
import styles from "../styles/Dashboard.module.css";

const SEARCHABLE = ["athleteCode", "firstName", "lastName", "middleName", "suffix"];

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
  const query = search.trim().toLowerCase();

  const filtered = React.useMemo(() => {
    if (!query) return athletes;
    return athletes.filter((athlete) => {
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
    });
  }, [athletes, query]);

  const allChecked = filtered.length > 0 && filtered.every((athlete) => selected.has(athlete.id));

  if (!athletes.length) return <p className={styles.empty}>{emptyText}</p>;

  return (
    <div>
      <div className={styles.toolbar}>
        <label className={styles.searchLabel}>
          Search athletes
          <input type="text" placeholder={searchPlaceholder} value={search} onChange={(event) => setSearch(event.target.value)} />
        </label>
        <span className={styles.formHint} style={{ alignSelf: "center" }}>{selected.size} selected</span>
      </div>
      <div className={styles.tableWrap} style={{ marginTop: 12 }}>
        <table>
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input
                  type="checkbox"
                  checked={allChecked}
                  onChange={() => onToggleAll(filtered.map((athlete) => athlete.id))}
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
            {filtered.map((athlete) => {
              const checked = selected.has(athlete.id);
              return (
                <tr key={athlete.id} style={{ opacity: checked ? 1 : 0.82 }}>
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
                    {nameCell ? nameCell(athlete) : <span style={{ fontWeight: 700 }}>{athlete.firstName} {athlete.middleName || ""} {athlete.lastName}</span>}
                  </td>
                  {showSport && <td data-label="Sport / event">{athlete.sport?.sportName || "Unassigned"}<small>{athlete.event?.eventName || ""}</small></td>}
                  {showCoach && <td data-label="Current coach">{athlete.coach ? `${athlete.coach.firstName} ${athlete.coach.lastName}` : "Unassigned"}</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}