import { prisma } from "../../../lib/prisma";
import { requireRole, requireSession, setSecurityHeaders } from "../../../lib/api-security";
import { rateLimiters } from "../../../lib/rate-limit";
import { attendanceFeatureEnabled } from "../../../lib/feature-flags";

/* Admin-only read-only archive of the retired session-attendance records.
   ==========================================================================
   Attendance was removed from the athlete workflow (Cauayan athletes train
   individually), but the data is preserved. This endpoint lists the old
   TrainingAttendance rows and can export them as CSV for record-keeping.
   It is READ-ONLY: no create/update/delete here. Nothing is ever removed.
   ========================================================================== */

const STATUSES = ["present", "late", "excused", "absent"];

function csvCell(value) {
  const s = value == null ? "" : String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function fmt(date) {
  return date ? new Date(date).toISOString() : "";
}

export default async function handler(req, res) {
  setSecurityHeaders(res);
  const session = await requireSession(req, res);
  if (!session) return;
  if (!requireRole(session, "admin", res)) return;

  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || "unknown";
  const rate = rateLimiters.api(`attendance-archive:${ip}`);
  if (!rate.allowed) return res.status(429).json({ error: "Too many requests. Please try again later." });

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });

  try {
    const rows = await prisma.trainingAttendance.findMany({
      orderBy: [{ session: { sessionDate: "desc" } }],
      include: {
        session: { select: { sessionDate: true, sessionType: true, venue: true, sport: { select: { sportName: true } }, coach: { select: { firstName: true, lastName: true, coachCode: true } } } },
        athlete: { select: { athleteCode: true, firstName: true, lastName: true } },
      },
      take: 5000,
    });

    if (req.query.format === "csv") {
      const header = ["Athlete Code", "Athlete Name", "Status", "Session Date", "Session Type", "Sport", "Venue", "Coach", "Check In", "Check Out", "Notes"];
      const lines = [header.map(csvCell).join(",")];
      for (const r of rows) {
        lines.push([
          r.athlete?.athleteCode || "",
          `${r.athlete?.lastName || ""}, ${r.athlete?.firstName || ""}`.trim().replace(/^,\s*/, ""),
          r.status,
          fmt(r.session?.sessionDate),
          r.session?.sessionType || "",
          r.session?.sport?.sportName || "",
          r.session?.venue || "",
          r.session?.coach ? `${r.session.coach.lastName}, ${r.session.coach.firstName}` : "",
          fmt(r.checkInTime),
          fmt(r.checkOutTime),
          r.notes || "",
        ].map(csvCell).join(","));
      }
      await prisma.auditLog.create({
        data: {
          userId: Number(session.user.id),
          action: "export",
          entityType: "training_attendance",
          entityId: null,
          description: `Exported ${rows.length} archived attendance record(s) to CSV.`,
        },
      }).catch(() => {});
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="attendance-archive-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send("\uFEFF" + lines.join("\r\n"));
      return;
    }

    const summary = { total: rows.length, present: 0, late: 0, excused: 0, absent: 0 };
    for (const r of rows) if (STATUSES.includes(r.status)) summary[r.status] += 1;

    return res.status(200).json({
      featureEnabled: attendanceFeatureEnabled(),
      summary,
      rows: rows.map((r) => ({
        id: r.id,
        athleteCode: r.athlete?.athleteCode || null,
        athleteName: r.athlete ? `${r.athlete.lastName}, ${r.athlete.firstName}` : null,
        status: r.status,
        sessionDate: fmt(r.session?.sessionDate),
        sessionType: r.session?.sessionType || null,
        sport: r.session?.sport?.sportName || null,
        venue: r.session?.venue || null,
        coachName: r.session?.coach ? `${r.session.coach.lastName}, ${r.session.coach.firstName}` : null,
        checkInTime: fmt(r.checkInTime) || null,
        checkOutTime: fmt(r.checkOutTime) || null,
        notes: r.notes || null,
      })),
    });
  } catch (error) {
    console.error("Attendance archive error:", error);
    return res.status(500).json({ error: "Could not load the attendance archive." });
  }
}
