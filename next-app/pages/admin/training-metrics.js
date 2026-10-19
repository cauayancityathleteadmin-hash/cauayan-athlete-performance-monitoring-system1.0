// Orphaned page retired (audit U-M1 / upgrade plan §11). The in-memory norm
// editor here never persisted edits, so it is replaced by a redirect to the
// real metrics catalog. Norm/band editing should be added to /admin/metrics
// (backed by the DB) rather than restoring this demo surface.
export async function getServerSideProps() {
  return { redirect: { destination: "/admin/metrics", permanent: false } };
}

export default function TrainingMetricsRetired() {
  return null;
}
