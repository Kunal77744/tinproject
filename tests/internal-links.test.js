import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the homepage and analyzer results lead to TinyDB debugging guidance", async () => {
  const [homepage, analyzer] = await Promise.all([
    page("../index.html"),
    page("../analyzer/index.html"),
  ]);

  assert.match(
    homepage,
    /href="\/app-inventor-tinydb-not-working\/"[\s\S]*?Follow the App Inventor TinyDB debugging guide/,
  );
  assert.match(
    analyzer,
    /href="\/app-inventor-tinydb-not-working\/"[\s\S]*?Read the App Inventor TinyDB debugging guide/,
  );
});

test("both TinyDB search pages lead directly to the analyzer", async () => {
  const [tinydbUi, debuggingGuide] = await Promise.all([
    page("../tinydb-ui/index.html"),
    page("../app-inventor-tinydb-not-working/index.html"),
  ]);

  assert.match(
    tinydbUi,
    /href="\/analyzer\/"[\s\S]*?Run private audit/,
  );
  assert.match(
    debuggingGuide,
    /href="\/analyzer\/\?source=debugging-guide"[\s\S]*?Check my literal tags/,
  );
});
