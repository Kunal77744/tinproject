export function createAuditCompletionTracker(capture) {
  const completedRuns = new Set();

  return (runId, properties) => {
    if (completedRuns.has(runId)) return false;
    completedRuns.add(runId);

    if (typeof capture === "function") {
      capture("tinydb_audit_completed", properties);
    }

    return true;
  };
}
