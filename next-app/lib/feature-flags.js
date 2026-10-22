/* Feature flags — server-side switches for optional features.
   ==========================================================================
   Attendance was removed from the athlete workflow because Cauayan athletes
   train individually (so roll-call wrongly marked individual trainers absent).
   The old TrainingAttendance data is kept — never deleted — and can be viewed
   read-only by admins at /admin/attendance-archive.

   Set ATTENDANCE_FEATURE_ENABLED=1 (or "true") in the environment to bring the
   feature back on. Everything else stays as-is: this flag only controls whether
   the attendance workflow is surfaced again.
   ========================================================================== */

export function attendanceFeatureEnabled() {
  const raw = process.env.ATTENDANCE_FEATURE_ENABLED;
  return raw === "1" || String(raw).toLowerCase() === "true";
}
