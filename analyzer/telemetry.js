import { auditErrorCode } from "./error-guidance.js";

const SEARCH_SOURCE_ALIASES = new Map([
  ["tinydb-ui", "tinydb-ui"],
  ["debugging-guide", "debugging-guide"],
  ["repair-order", "debugging-guide"],
  ["debugging-guide-footer", "debugging-guide"],
  ["cross-screen-guide-header", "cross-screen-guide"],
  ["cross-screen-guide", "cross-screen-guide"],
  ["cross-screen-guide-footer", "cross-screen-guide"],
]);

export function allowlistedSearchSource(source) {
  return SEARCH_SOURCE_ALIASES.get(source) ?? null;
}

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

export function createSearchAuditStartTracker(capture) {
  const startedRuns = new Set();

  return (runId, properties) => {
    const source = allowlistedSearchSource(properties.source);
    const auditRoute = properties.audit_route;

    if (
      source === null ||
      !["sample", "local_file"].includes(auditRoute) ||
      startedRuns.has(runId)
    ) {
      return false;
    }
    startedRuns.add(runId);

    if (typeof capture === "function") {
      capture("tinydb_search_audit_started", {
        source,
        audit_route: auditRoute,
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
