import { analyzeAia } from "./parser.js";
import { guidanceForAuditError } from "./error-guidance.js";
import {
  createAuditResult,
  createFullReportMailto,
  createRepairSummary,
  shouldOfferLocalAudit,
} from "./result-actions.js";
import {
  createAuditCompletionTracker,
  createAuditFailureTracker,
  createSearchAuditStartTracker,
  createAuditStartTracker,
  createPaidReportInterestTracker,
  createRealProjectCompletionTracker,
} from "./telemetry.js";

const sampleButton = document.querySelector("#sample-button");
const fileInput = document.querySelector("#project-file");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const overview = document.querySelector("#overview");
const screenList = document.querySelector("#screen-list");
const checklist = document.querySelector("#checklist");
const repairTitle = document.querySelector("#repair-title");
const repairIntro = document.querySelector("#repair-intro");
const copySummaryButton = document.querySelector("#copy-summary");
const copyStatus = document.querySelector("#copy-status");
const fullReportLink = document.querySelector("#full-report-link");
const sampleNextStep = document.querySelector("#sample-next-step");
const auditOwnButton = document.querySelector("#audit-own-button");
let auditRun = 0;
let activeResult = null;
const searchSource = new URLSearchParams(window.location.search).get("source");
const captureAuditEvent = (event, properties) => {
  window.posthog?.capture?.(event, properties);
};
const captureAuditStarted = createAuditStartTracker(captureAuditEvent);
const captureSearchAuditStarted =
  createSearchAuditStartTracker(captureAuditEvent);
const captureAuditCompleted = createAuditCompletionTracker(captureAuditEvent);
const captureAuditFailed = createAuditFailureTracker(captureAuditEvent);
const captureRealProjectCompleted = createRealProjectCompletionTracker(
  captureAuditEvent,
);
const capturePaidReportInterest = createPaidReportInterestTracker(captureAuditEvent);

fullReportLink.href = createFullReportMailto();

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderAudit(audit, projectName, runId, source) {
  const tagCount = new Set(audit.tagUsages.map(({ tag }) => tag)).size;
  const namingIssueCount = audit.issues.filter(
    ({ type }) => type === "tag_mismatch",
  ).length;
  const typeConflictCount = audit.issues.filter(
    ({ type }) => type === "literal_type_conflict",
  ).length;
  overview.innerHTML = `
    <div><strong>${audit.screens.length}</strong><span>Screens mapped</span></div>
    <div><strong>${tagCount}</strong><span>Tag spellings</span></div>
    <div><strong>${namingIssueCount}</strong><span>Likely mismatch</span></div>
    <div><strong>${typeConflictCount}</strong><span>Type warnings</span></div>
    <div><strong>${audit.clears.length}</strong><span>Clear calls</span></div>
  `;

  screenList.innerHTML = audit.screens
    .map(
      (screen) => `
        <article class="screen-card">
          <div class="screen-heading">
            <span class="screen-dot" aria-hidden="true"></span>
            <div><span>Screen</span><h3>${escapeHtml(screen.name)}</h3></div>
          </div>
          <ul>
            ${screen.usages
              .map(
                (usage) => {
                  const operationLabels = {
                    store: "Store value",
                    get: "Get value",
                    clear_tag: "Clear tag",
                    clear_all: "Clear all",
                  };
                  const displayTag =
                    usage.operation === "clear_all" ? "All stored tags" : usage.tag;

                  return `
                  <li>
                    <code>${escapeHtml(displayTag)}</code>
                    <span class="operation-detail">
                      <span class="operation operation-${usage.operation}">${operationLabels[usage.operation]}</span>
                      <span class="component-name">${escapeHtml(usage.component)}</span>
                    </span>
                  </li>
                `;
                },
              )
              .join("")}
          </ul>
        </article>
      `,
    )
    .join("");

  const auditResult = createAuditResult(audit);
  const includesPassedCheck = auditResult.items.some(
    ({ status: itemStatus }) => itemStatus === "passed",
  );
  repairTitle.textContent = auditResult.title;
  repairIntro.textContent = auditResult.intro;
  checklist.innerHTML = auditResult.items
    .map((item, index) => {
      const isPassed = item.status === "passed";
      const itemNumber = includesPassedCheck ? index : index + 1;
      const marker = isPassed ? "✓" : String(itemNumber).padStart(2, "0");

      return `
        <li>
          <span class="check-number${isPassed ? " check-number-passed" : ""}"${isPassed ? ' aria-label="Passed"' : ""}>${marker}</span>
          <div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.detail)}</p></div>
        </li>
      `;
    })
    .join("");

  status.textContent = `Audit complete for ${projectName}. Nothing left your browser.`;
  activeResult = {
    runId,
    source,
    repairSummary: createRepairSummary(audit),
  };
  copyStatus.textContent = "";
  sampleNextStep.hidden = !shouldOfferLocalAudit(source);
  results.hidden = false;
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function runAudit(buffer, projectName, source) {
  const runId = ++auditRun;
  captureAuditStarted(runId, {
    route: window.location.pathname,
    source,
  });
  captureSearchAuditStarted(runId, {
    source: searchSource,
    audit_route: source,
  });
  status.textContent = `Inspecting ${projectName} locally…`;
  results.hidden = true;
  sampleNextStep.hidden = true;
  activeResult = null;

  try {
    const audit = await analyzeAia(buffer);
    renderAudit(audit, projectName, runId, source);
    captureAuditCompleted(runId, {
      route: window.location.pathname,
      source,
      screens_mapped: audit.screens.length,
      tag_spellings: new Set(audit.tagUsages.map(({ tag }) => tag)).size,
      likely_mismatches: audit.issues.filter(
        ({ type }) => type === "tag_mismatch",
      ).length,
    });
    captureRealProjectCompleted(runId, {
      route: window.location.pathname,
      source,
      succeeded: true,
    });
  } catch (error) {
    status.textContent = guidanceForAuditError(error);
    captureAuditFailed(runId, {
      route: window.location.pathname,
      source,
      error_code: error?.code,
    });
  }
}

copySummaryButton.addEventListener("click", async () => {
  if (!activeResult) return;

  try {
    await navigator.clipboard.writeText(activeResult.repairSummary);
    copyStatus.textContent = "Repair summary copied.";
  } catch {
    copyStatus.textContent = "Copy failed. Select the repair steps above and copy them manually.";
  }
});

fullReportLink.addEventListener("click", () => {
  if (!activeResult) return;

  capturePaidReportInterest(activeResult.runId, {
    route: window.location.pathname,
    source: activeResult.source,
  });
});

auditOwnButton.addEventListener("click", () => {
  fileInput.value = "";
  fileInput.click();
});

async function runSampleAudit() {
  sampleButton.disabled = true;
  try {
    const response = await fetch("./samples/tinydb-cross-screen-mismatch.aia");
    if (!response.ok) throw new Error("The sample project could not be loaded.");
    await runAudit(await response.arrayBuffer(), "TinyDB mismatch sample", "sample");
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "The sample project could not be loaded.";
  } finally {
    sampleButton.disabled = false;
  }
}

sampleButton.addEventListener("click", runSampleAudit);

fileInput.addEventListener("change", async () => {
  const [file] = fileInput.files;
  if (!file) return;
  await runAudit(await file.arrayBuffer(), file.name, "local_file");
});

if (new URLSearchParams(window.location.search).get("sample") === "1") {
  runSampleAudit();
}
