import { auditErrorCode } from "./error-guidance.js";

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

export function createAuditFailureTracker(capture) {
  const failedRuns = new Set();

  return (runId, properties) => {
    if (failedRuns.has(runId)) return false;
    failedRuns.add(runId);

    if (typeof capture === "function") {
      capture("tinydb_audit_failed", {
        route: properties.route,
        source: properties.source,
        error_code: auditErrorCode({ code: properties.error_code }),
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
      const safeProperties = {
        route: properties.route,
        source: properties.source,
        screens_mapped: properties.screens_mapped,
        tag_spellings: properties.tag_spellings,
        likely_mismatches: properties.likely_mismatches,
      };

      capture(
        "tinydb_audit_completed",
        Object.fromEntries(
          Object.entries(safeProperties).filter(([, value]) => value !== undefined),
        ),
      );
    }

    return true;
  };
}

export function createRealProjectCompletionTracker(capture) {
  const completedRuns = new Set();

  return (runId, properties) => {
    if (
      properties.source !== "local_file" ||
      properties.succeeded !== true ||
      completedRuns.has(runId)
    ) {
      return false;
    }
    completedRuns.add(runId);

    if (typeof capture === "function") {
      capture("tinydb_real_project_audit_completed", {
        route: properties.route,
        source: properties.source,
      });
    }

    return true;
  };
}

export function createPaidReportInterestTracker(capture) {
  const interestedRuns = new Set();

  return (runId, properties) => {
    if (interestedRuns.has(runId)) return false;
    interestedRuns.add(runId);

    if (typeof capture === "function") {
      capture("tinydb_paid_report_interest_clicked", {
        route: properties.route,
        source: properties.source,
      });
    }

    return true;
  };
}
