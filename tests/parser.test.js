import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { analyzeAia, buildAudit, extractTinyDbUsage } from "../analyzer/parser.js";
import { guidanceForAuditError } from "../analyzer/error-guidance.js";
import {
  createAuditCompletionTracker,
  createAuditStartTracker,
  createPaidReportInterestTracker,
  createRealProjectCompletionTracker,
} from "../analyzer/telemetry.js";
import {
  createFullReportMailto,
  createRepairSummary,
  shouldOfferLocalAudit,
  SUPPORT_ADDRESS,
} from "../analyzer/result-actions.js";

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
      tag: "profile_name",
      operation: "store",
      defaultValue: null,
      blockId: "store-profile",
    },
  ]);

  assert.deepEqual(extractTinyDbUsage(screenTwo, "Screen2"), [
    {
      screen: "Screen2",
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
      tag: "ID",
      operation: "store",
      defaultValue: null,
      blockId: "store-id",
    },
    {
      screen: "DeviceSetup",
      tag: "PW",
      operation: "store",
      defaultValue: null,
      blockId: "store-password",
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

test("does not imply a project is bug-free when no literal tags are found", () => {
  const message = guidanceForAuditError({ code: "no_literal_tags" });

  assert.match(message, /no literal TinyDB StoreValue or GetValue tags/);
  assert.match(message, /variables or text joins/);
  assert.match(message, /doesn't analyze dynamic tags yet/);
});
