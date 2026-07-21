import { analyzeAia } from "./parser.js";

const sampleButton = document.querySelector("#sample-button");
const fileInput = document.querySelector("#project-file");
const status = document.querySelector("#status");
const results = document.querySelector("#results");
const overview = document.querySelector("#overview");
const screenList = document.querySelector("#screen-list");
const checklist = document.querySelector("#checklist");

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderAudit(audit, projectName) {
  const tagCount = new Set(audit.usages.map(({ tag }) => tag)).size;
  overview.innerHTML = `
    <div><strong>${audit.screens.length}</strong><span>Screens mapped</span></div>
    <div><strong>${tagCount}</strong><span>Tag spellings</span></div>
    <div><strong>${audit.issues.length}</strong><span>Likely mismatch</span></div>
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
                (usage) => `
                  <li>
                    <code>${escapeHtml(usage.tag)}</code>
                    <span class="operation operation-${usage.operation}">${usage.operation === "store" ? "Store value" : "Get value"}</span>
                  </li>
                `,
              )
              .join("")}
          </ul>
        </article>
      `,
    )
    .join("");

  checklist.innerHTML = audit.issues.length
    ? audit.issues
        .map(
          (issue, index) => `
            <li>
              <span class="check-number">${String(index + 1).padStart(2, "0")}</span>
              <div><h3>${escapeHtml(issue.title)}</h3><p>${escapeHtml(issue.detail)}</p></div>
            </li>
          `,
        )
        .join("")
    : '<li class="clear-result"><span aria-hidden="true">✓</span><div><h3>No likely cross-screen mismatch found</h3><p>Review dynamic tag values manually before shipping.</p></div></li>';

  status.textContent = `Audit complete for ${projectName}. Nothing left your browser.`;
  results.hidden = false;
  results.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function runAudit(buffer, projectName) {
  status.textContent = `Inspecting ${projectName} locally…`;
  results.hidden = true;

  try {
    renderAudit(await analyzeAia(buffer), projectName);
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "This project could not be inspected.";
  }
}

sampleButton.addEventListener("click", async () => {
  sampleButton.disabled = true;
  try {
    const response = await fetch("./samples/tinydb-cross-screen-mismatch.aia");
    if (!response.ok) throw new Error("The sample project could not be loaded.");
    await runAudit(await response.arrayBuffer(), "TinyDB mismatch sample");
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : "The sample project could not be loaded.";
  } finally {
    sampleButton.disabled = false;
  }
});

fileInput.addEventListener("change", async () => {
  const [file] = fileInput.files;
  if (!file) return;
  await runAudit(await file.arrayBuffer(), file.name);
});
