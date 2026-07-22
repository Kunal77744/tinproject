export function createAuditStartTracker(capture) {
  const startedRuns = new Set();

  return (runId, properties) => {
    if (startedRuns.has(runId)) return false;
    startedRuns.add(runId);

    if (typeof capture === "function") {
      capture("tinydb_audit_started", {
        route: properties.route,
        source: properties.source,
      });
    }

    return true;
  };
}

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
