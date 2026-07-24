import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { analyzeAia, buildAudit, extractTinyDbUsage } from "../analyzer/parser.js";
import { auditErrorCode, guidanceForAuditError } from "../analyzer/error-guidance.js";
import {
  createAuditCompletionTracker,
  createAuditFailureTracker,
  createSearchAuditStartTracker,
  createAuditStartTracker,
  createPaidReportInterestTracker,
  createRealProjectCompletionTracker,
} from "../analyzer/telemetry.js";
import {
  createAuditResult,
  createFullReportMailto,
  createRepairSummary,
  shouldOfferLocalAudit,
  SUPPORT_ADDRESS,
} from "../analyzer/result-actions.js";
import { createStoredZip } from "./fixture-archive.js";

const screenOne = `
  <xml xmlns="https://developers.google.com/blockly/xml">
    <block type="component_method" id="store-profile">
      <mutation component_type="TinyDB" method_name="StoreValue" />
      <value name="ARG0"><block type="text"><field name="TEXT">profile_name</field></block></value>
      <value name="ARG1"><block type="text"><field name="TEXT">Ada</field></block></value>
    </block>
  </xml>`;

const screenTwo = `
  <xml xmlns="https://developers.google.com/blockly/xml">
    <block type="component_method" id="get-profile">
      <mutation component_type="TinyDB" method_name="GetValue" />
      <value name="ARG0"><block type="text"><field name="TEXT">profile-name</field></block></value>
      <value name="ARG1"><block type="text"><field name="TEXT">Unknown</field></block></value>
    </block>
  </xml>`;

const chainedTinyDbCalls = `
  <xml xmlns="https://developers.google.com/blockly/xml">
    <block type="component_method" id="store-id">
      <mutation component_type="TinyDB" method_name="StoreValue" />
      <value name="ARG0"><block type="text"><field name="TEXT">ID</field></block></value>
      <value name="ARG1"><block type="text"><field name="TEXT">123</field></block></value>
      <next>
        <block type="component_method" id="store-password">
          <mutation component_type="TinyDB" method_name="StoreValue" />
          <value name="ARG0"><block type="text"><field name="TEXT">PW</field></block></value>
          <value name="ARG1"><block type="text"><field name="TEXT">secret</field></block></value>
        </block>
      </next>
    </block>
  </xml>`;

test("extracts literal TinyDB operations from App Inventor blocks", () => {
  assert.deepEqual(extractTinyDbUsage(screenOne, "Screen1"), [
    {
      screen: "Screen1",
      component: "TinyDB",
      tag: "profile_name",
      operation: "store",
      defaultValue: null,
      blockId: "store-profile",
    },
  ]);

  assert.deepEqual(extractTinyDbUsage(screenTwo, "Screen2"), [
    {
      screen: "Screen2",
      component: "TinyDB",
      tag: "profile-name",
      operation: "get",
      defaultValue: "Unknown",
      blockId: "get-profile",
    },
  ]);
});

test("extracts every TinyDB operation in a chained block stack", () => {
  assert.deepEqual(extractTinyDbUsage(chainedTinyDbCalls, "DeviceSetup"), [
    {
      screen: "DeviceSetup",
      component: "TinyDB",
      tag: "ID",
      operation: "store",
      defaultValue: null,
      blockId: "store-id",
    },
    {
      screen: "DeviceSetup",
      component: "TinyDB",
      tag: "PW",
      operation: "store",
      defaultValue: null,
      blockId: "store-password",
    },
  ]);
});

test("extracts static ClearTag and ClearAll calls without guessing dynamic tags", () => {
  const clearCalls = `
    <xml xmlns="https://developers.google.com/blockly/xml">
      <block type="component_method" id="clear-profile">
        <mutation component_type="TinyDB" instance_name="TinyDB1" method_name="ClearTag" />
        <value name="ARG0"><block type="text"><field name="TEXT">profile_name</field></block></value>
        <next>
          <block type="component_method" id="clear-dynamic">
            <mutation component_type="TinyDB" instance_name="TinyDB1" method_name="ClearTag" />
            <value name="ARG0"><block type="lexical_variable_get"><field name="VAR">tagName</field></block></value>
            <next>
              <block type="component_method" id="clear-everything">
                <mutation component_type="TinyDB" instance_name="TinyDB2" method_name="ClearAll" />
              </block>
            </next>
          </block>
        </next>
      </block>
    </xml>`;

  assert.deepEqual(extractTinyDbUsage(clearCalls, "Settings"), [
    {
      screen: "Settings",
      component: "TinyDB1",
      tag: "profile_name",
      operation: "clear_tag",
      defaultValue: null,
      blockId: "clear-profile",
    },
    {
      screen: "Settings",
      component: "TinyDB2",
      tag: null,
      operation: "clear_all",
      defaultValue: null,
      blockId: "clear-everything",
    },
  ]);
});

test("flags a punctuation-only tag mismatch across screens", () => {
  const usages = [
    ...extractTinyDbUsage(screenOne, "Screen1"),
    ...extractTinyDbUsage(screenTwo, "Screen2"),
  ];
  const audit = buildAudit(usages);

  assert.equal(audit.screens.length, 2);
  assert.equal(audit.issues.length, 1);
  assert.equal(audit.issues[0].type, "tag_mismatch");
  assert.match(audit.issues[0].title, /profile-name/);
  assert.match(audit.issues[0].detail, /profile_name/);
});

test("opens the representative .aia sample and finds the known mismatch", async () => {
  const sample = await readFile(
    new URL("../analyzer/samples/tinydb-cross-screen-mismatch.aia", import.meta.url),
  );
  const audit = await analyzeAia(sample);

  assert.deepEqual(audit.screens.map(({ name }) => name), ["Screen1", "Screen2"]);
  assert.deepEqual(audit.usages.map(({ tag }) => tag), ["profile_name", "profile-name"]);
  assert.equal(audit.issues.length, 1);
});

test("finds destructive clears in an App Inventor .aia regression fixture", async () => {
  const [screen1, screen2, project] = await Promise.all([
    readFile(
      new URL(
        "./fixture-source/app-inventor-clears/src/appinventor/ai_tin/ClearCalls/Screen1.bky",
        import.meta.url,
      ),
    ),
    readFile(
      new URL(
        "./fixture-source/app-inventor-clears/src/appinventor/ai_tin/ClearCalls/Screen2.bky",
        import.meta.url,
      ),
    ),
    readFile(
      new URL(
        "./fixture-source/app-inventor-clears/youngandroidproject/project.properties",
        import.meta.url,
      ),
    ),
  ]);
  const fixture = createStoredZip([
    ["src/appinventor/ai_tin/ClearCalls/Screen1.bky", screen1],
    ["src/appinventor/ai_tin/ClearCalls/Screen2.bky", screen2],
    ["youngandroidproject/project.properties", project],
  ]);
  const audit = await analyzeAia(fixture);

  assert.equal(audit.clears.length, 2);
  assert.deepEqual(
    audit.clears.map(({ screen, component, tag, operation }) => ({
      screen,
      component,
      tag,
      operation,
    })),
    [
      {
        screen: "Screen1",
        component: "TinyDB1",
        tag: "session_token",
        operation: "clear_tag",
      },
      {
        screen: "Screen2",
        component: "TinyDB2",
        tag: null,
        operation: "clear_all",
      },
    ],
  );
});

test("finds destructive clears in a standard io.kodular .aia regression fixture", async () => {
  const [screen, project] = await Promise.all([
    readFile(
      new URL(
        "./fixture-source/kodular-clears/src/io/kodular/tin/ClearCalls/Screen1.bky",
        import.meta.url,
      ),
    ),
    readFile(
      new URL(
        "./fixture-source/kodular-clears/youngandroidproject/project.properties",
        import.meta.url,
      ),
    ),
  ]);
  const fixture = createStoredZip([
    ["src/io/kodular/tin/ClearCalls/Screen1.bky", screen],
    ["youngandroidproject/project.properties", project],
  ]);
  const audit = await analyzeAia(fixture);

  assert.equal(audit.clears.length, 2);
  assert.deepEqual(
    audit.clears.map(({ component, tag, operation }) => ({
      component,
      tag,
      operation,
    })),
    [
      {
        component: "Tiny_DB1",
        tag: "profile_name",
        operation: "clear_tag",
      },
      {
        component: "Tiny_DB1",
        tag: null,
        operation: "clear_all",
      },
    ],
  );
});

test("records one completion event for each successful audit run", () => {
  const events = [];
  const trackCompletion = createAuditCompletionTracker((event, properties) => {
    events.push({ event, properties });
  });

  assert.equal(trackCompletion(1, { source: "sample" }), true);
  assert.equal(trackCompletion(1, { source: "sample" }), false);
  assert.equal(events.length, 1);
  assert.equal(events[0].event, "tinydb_audit_completed");
  assert.deepEqual(events[0].properties, { source: "sample" });
});

test("keeps local-file completion analytics free of filenames and project contents", () => {
  const events = [];
  const trackCompletion = createAuditCompletionTracker((event, properties) => {
    events.push({ event, properties });
  });

  trackCompletion(1, {
    route: "/analyzer/",
    source: "local_file",
    screens_mapped: 2,
    tag_spellings: 2,
    likely_mismatches: 1,
    project_name: "private-project.aia",
    tags: ["private_tag"],
  });

  assert.deepEqual(events, [
    {
      event: "tinydb_audit_completed",
      properties: {
        route: "/analyzer/",
        source: "local_file",
        screens_mapped: 2,
        tag_spellings: 2,
        likely_mismatches: 1,
      },
    },
  ]);
});

test("records one dedicated real-project event for a successful local-file audit", () => {
  const events = [];
  const trackRealProjectCompletion = createRealProjectCompletionTracker(
    (event, properties) => events.push({ event, properties }),
  );

  assert.equal(
    trackRealProjectCompletion(1, {
      route: "/analyzer/",
      source: "local_file",
      succeeded: true,
      project_name: "private-project.aia",
      tags: ["private_tag"],
    }),
    true,
  );
  assert.equal(
    trackRealProjectCompletion(1, {
      route: "/analyzer/",
      source: "local_file",
      succeeded: true,
    }),
    false,
  );

  assert.deepEqual(events, [
    {
      event: "tinydb_real_project_audit_completed",
      properties: { route: "/analyzer/", source: "local_file" },
    },
  ]);
});

test("never records the real-project event for the prepared sample", () => {
  const events = [];
  const trackRealProjectCompletion = createRealProjectCompletionTracker(
    (event, properties) => events.push({ event, properties }),
  );

  assert.equal(
    trackRealProjectCompletion(1, {
      route: "/analyzer/",
      source: "sample",
      succeeded: true,
    }),
    false,
  );
  assert.deepEqual(events, []);
});

test("never records the real-project event when a local audit fails", async () => {
  const events = [];
  const trackRealProjectCompletion = createRealProjectCompletionTracker(
    (event, properties) => events.push({ event, properties }),
  );

  await assert.rejects(analyzeAia(new TextEncoder().encode("not a zip archive")));

  assert.equal(
    trackRealProjectCompletion(1, {
      route: "/analyzer/",
      source: "local_file",
      succeeded: false,
    }),
    false,
  );
  assert.deepEqual(events, []);
});

test("offers a real local audit only after the prepared sample", () => {
  assert.equal(shouldOfferLocalAudit("sample"), true);
  assert.equal(shouldOfferLocalAudit("local_file"), false);
});

test("records one privacy-safe start event for each audit run", () => {
  const events = [];
  const trackStart = createAuditStartTracker((event, properties) => {
    events.push({ event, properties });
  });

  assert.equal(
    trackStart(1, {
      route: "/analyzer/",
      source: "sample",
      project_name: "must not be captured",
    }),
    true,
  );
  assert.equal(trackStart(1, { route: "/analyzer/", source: "sample" }), false);
  assert.equal(trackStart(2, { route: "/analyzer/", source: "local_file" }), true);

  assert.deepEqual(events, [
    {
      event: "tinydb_audit_started",
      properties: { route: "/analyzer/", source: "sample" },
    },
    {
      event: "tinydb_audit_started",
      properties: { route: "/analyzer/", source: "local_file" },
    },
  ]);
});

test("records one search-referred start for sample and local-file audit runs", () => {
  const events = [];
  const trackSearchStart = createSearchAuditStartTracker((event, properties) => {
    events.push({ event, properties });
  });

  assert.equal(
    trackSearchStart(1, {
      source: "tinydb-ui",
      audit_route: "sample",
      filename: "must not be captured.aia",
    }),
    true,
  );
  assert.equal(
    trackSearchStart(1, {
      source: "tinydb-ui",
      audit_route: "sample",
    }),
    false,
  );
  assert.equal(
    trackSearchStart(2, {
      source: "cross-screen-guide-footer",
      audit_route: "local_file",
      tags: ["must_not_be_captured"],
    }),
    true,
  );

  assert.deepEqual(events, [
    {
      event: "tinydb_search_audit_started",
      properties: { source: "tinydb-ui", audit_route: "sample" },
    },
    {
      event: "tinydb_search_audit_started",
      properties: {
        source: "cross-screen-guide",
        audit_route: "local_file",
      },
    },
  ]);
});

test("does not record search starts for direct or unapproved analyzer visits", () => {
  const events = [];
  const trackSearchStart = createSearchAuditStartTracker((event, properties) => {
    events.push({ event, properties });
  });

  assert.equal(
    trackSearchStart(1, { source: null, audit_route: "sample" }),
    false,
  );
  assert.equal(
    trackSearchStart(2, {
      source: "https://private.example/customer",
      audit_route: "local_file",
    }),
    false,
  );
  assert.equal(
    trackSearchStart(3, {
      source: "debugging-guide",
      audit_route: "unsupported_route",
    }),
    false,
  );
  assert.deepEqual(events, []);
});

test("records one privacy-safe failure event for sample and local-file runs", () => {
  const events = [];
  const trackFailure = createAuditFailureTracker((event, properties) => {
    events.push({ event, properties });
  });

  assert.equal(
    trackFailure(1, {
      route: "/analyzer/",
      source: "sample",
      error_code: "invalid_project",
      project_name: "must not be captured",
      message: "must not be captured",
    }),
    true,
  );
  assert.equal(
    trackFailure(2, {
      route: "/analyzer/",
      source: "local_file",
      error_code: "invalid_archive",
      filename: "private-project.aia",
      stack: "must not be captured",
    }),
    true,
  );

  assert.deepEqual(events, [
    {
      event: "tinydb_audit_failed",
      properties: {
        route: "/analyzer/",
        source: "sample",
        error_code: "invalid_project",
      },
    },
    {
      event: "tinydb_audit_failed",
      properties: {
        route: "/analyzer/",
        source: "local_file",
        error_code: "invalid_archive",
      },
    },
  ]);
});

test("deduplicates failures and replaces arbitrary error text with a safe code", () => {
  const events = [];
  const trackFailure = createAuditFailureTracker((event, properties) => {
    events.push({ event, properties });
  });

  assert.equal(
    trackFailure(1, {
      route: "/analyzer/",
      source: "local_file",
      error_code: "private customer content",
    }),
    true,
  );
  assert.equal(
    trackFailure(1, {
      route: "/analyzer/",
      source: "local_file",
      error_code: "unsupported_compression",
    }),
    false,
  );

  assert.deepEqual(events, [
    {
      event: "tinydb_audit_failed",
      properties: {
        route: "/analyzer/",
        source: "local_file",
        error_code: "unknown_error",
      },
    },
  ]);
});

test("successful audit tracking does not emit a failure event", () => {
  const events = [];
  const trackCompletion = createAuditCompletionTracker((event, properties) => {
    events.push({ event, properties });
  });

  trackCompletion(1, {
    route: "/analyzer/",
    source: "sample",
    screens_mapped: 2,
  });

  assert.equal(events.some(({ event }) => event === "tinydb_audit_failed"), false);
});

test("builds a copyable summary from only the visible repair result", () => {
  const audit = buildAudit([
    ...extractTinyDbUsage(screenOne, "Screen1"),
    ...extractTinyDbUsage(screenTwo, "Screen2"),
  ]);
  const summary = createRepairSummary(audit);

  assert.match(summary, /^TinyDB repair summary/);
  assert.match(summary, /profile_name/);
  assert.match(summary, /Rerun the browser-only audit/);
});

test("turns a clean literal-tag audit into an honest next-step checklist", () => {
  const audit = buildAudit([
    ...extractTinyDbUsage(screenOne, "Screen1"),
    ...extractTinyDbUsage(
      screenTwo.replace("profile-name", "profile_name"),
      "Screen2",
    ),
  ]);
  const result = createAuditResult(audit);
  const manualItems = result.items.filter(({ status }) => status === "manual");

  assert.equal(audit.issues.length, 0);
  assert.equal(result.title, "Next-step checklist");
  assert.match(result.intro, /manual checks/);
  assert.equal(manualItems.length, 2);
  assert.match(result.items[0].detail, /literal TinyDB StoreValue and GetValue tags across 2 screens/);
  assert.match(result.items[0].detail, /does not guarantee the project is bug-free/);
  assert.equal(result.items[1].title, "Static clear-call check complete");
  assert.match(result.items[1].detail, /no standard TinyDB ClearTag or ClearAll calls/);
  assert.match(manualItems[0].detail, /variables or text joins/);
  assert.match(manualItems[0].detail, /Dynamic tag values are not analyzed/);
  assert.match(manualItems[1].title, /value types and defaults/i);
});

test("keeps mismatch repair results unchanged", () => {
  const audit = buildAudit([
    ...extractTinyDbUsage(screenOne, "Screen1"),
    ...extractTinyDbUsage(screenTwo, "Screen2"),
  ]);
  const result = createAuditResult(audit);

  assert.equal(result.title, "Repair checklist");
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0], audit.issues[0]);
});

test("copies the same clean-result guidance shown on screen", () => {
  const audit = buildAudit([
    ...extractTinyDbUsage(screenOne, "Screen1"),
    ...extractTinyDbUsage(
      screenTwo.replace("profile-name", "profile_name"),
      "Screen2",
    ),
  ]);
  const summary = createRepairSummary(audit);

  assert.match(summary, /Literal tag naming check complete/);
  assert.match(summary, /Static clear-call check complete/);
  assert.match(summary, /Check tags built at runtime/);
  assert.match(summary, /Check value types and defaults/);
  assert.match(summary, /does not guarantee the project is bug-free/);
});

test("shows careful ClearTag and ClearAll warnings in the result and copied summary", () => {
  const audit = buildAudit([
    ...extractTinyDbUsage(screenOne, "Screen1"),
    ...extractTinyDbUsage(
      `
        <xml xmlns="https://developers.google.com/blockly/xml">
          <block type="component_method" id="clear-profile">
            <mutation component_type="TinyDB" instance_name="TinyDB1" method_name="ClearTag" />
            <value name="ARG0"><block type="text"><field name="TEXT">profile_name</field></block></value>
            <next>
              <block type="component_method" id="clear-all">
                <mutation component_type="TinyDB" instance_name="TinyDB2" method_name="ClearAll" />
              </block>
            </next>
          </block>
        </xml>`,
      "Settings",
    ),
  ]);
  const result = createAuditResult(audit);
  const summary = createRepairSummary(audit);

  assert.equal(result.title, "Clear-call review");
  assert.match(result.items[1].title, /profile_name/);
  assert.match(result.items[1].detail, /Settings uses TinyDB1\.ClearTag/);
  assert.match(result.items[1].detail, /removes that tag's stored value/);
  assert.match(result.items[1].detail, /cannot determine when the block runs or whether the clear is a bug/);
  assert.match(result.items[2].title, /TinyDB2\.ClearAll on Settings/);
  assert.match(result.items[2].detail, /remove every tag/);
  assert.match(result.items[2].detail, /current store or namespace/);
  assert.match(summary, /Settings uses TinyDB1\.ClearTag/);
  assert.match(summary, /Settings uses TinyDB2\.ClearAll/);
});

test("opens a privacy-safe fuller-report email draft in the managed inbox", () => {
  const url = new URL(createFullReportMailto());

  assert.equal(url.protocol, "mailto:");
  assert.equal(url.pathname, SUPPORT_ADDRESS);
  assert.equal(url.searchParams.get("subject"), "TinyDB fuller repair report");
  assert.match(url.searchParams.get("body"), /I'd like to ask about a fuller TinyDB repair report/);
  assert.doesNotMatch(url.searchParams.get("body"), /profile_name|\.aia|Screen1/);
});

test("records paid-report interest once per completed result without project data", () => {
  const events = [];
  const trackInterest = createPaidReportInterestTracker((event, properties) => {
    events.push({ event, properties });
  });

  assert.equal(
    trackInterest(1, {
      route: "/analyzer/",
      source: "sample",
      project_name: "must not be captured",
      tags: ["must-not-leave-the-browser"],
    }),
    true,
  );
  assert.equal(trackInterest(1, { route: "/analyzer/", source: "sample" }), false);
  assert.equal(trackInterest(2, { route: "/analyzer/", source: "local_file" }), true);

  assert.deepEqual(events, [
    {
      event: "tinydb_paid_report_interest_clicked",
      properties: { route: "/analyzer/", source: "sample" },
    },
    {
      event: "tinydb_paid_report_interest_clicked",
      properties: { route: "/analyzer/", source: "local_file" },
    },
  ]);
});

test("gives invalid archives an export-and-retry step", async () => {
  await assert.rejects(
    analyzeAia(new TextEncoder().encode("not a zip archive")),
    (error) => {
      assert.equal(error.code, "invalid_archive");
      assert.match(guidanceForAuditError(error), /Export the project again/);
      assert.match(guidanceForAuditError(error), /choose the new \.aia file/);
      return true;
    },
  );
});

test("explains what to try when archive compression is unsupported", () => {
  const message = guidanceForAuditError({ code: "unsupported_compression" });

  assert.match(message, /compression/);
  assert.match(message, /Re-export/);
  assert.match(message, /Chrome or Edge/);
});

test("maps unrecognized audit failures to an allow-listed fallback code", () => {
  assert.equal(auditErrorCode({ code: "invalid_archive" }), "invalid_archive");
  assert.equal(auditErrorCode({ code: "contains private details" }), "unknown_error");
  assert.equal(auditErrorCode({ code: "__proto__" }), "unknown_error");
  assert.equal(auditErrorCode(new Error("contains private details")), "unknown_error");
});

test("does not imply a project is bug-free when no literal tags are found", () => {
  const message = guidanceForAuditError({ code: "no_literal_tags" });

  assert.match(message, /no supported TinyDB StoreValue, GetValue, ClearTag, or ClearAll calls/);
  assert.match(message, /tags or components are built dynamically/);
  assert.match(message, /doesn't resolve runtime values yet/);
});
