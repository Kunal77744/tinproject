import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("the homepage and analyzer results lead to the right TinyDB guidance", async () => {
  const [homepage, analyzer] = await Promise.all([
    page("../index.html"),
    page("../analyzer/index.html"),
  ]);

  assert.match(
    homepage,
    /href="\/app-inventor-tinydb-multiple-screens\/"[\s\S]*?Follow the multiple-screens repair guide/,
  );
  assert.match(
    analyzer,
    /href="\/app-inventor-tinydb-not-working\/"[\s\S]*?Read the App Inventor TinyDB debugging guide/,
  );
});

test("all TinyDB search pages lead directly to the analyzer", async () => {
  const [tinydbUi, debuggingGuide, crossScreenGuide] = await Promise.all([
    page("../tinydb-ui/index.html"),
    page("../app-inventor-tinydb-not-working/index.html"),
    page("../app-inventor-tinydb-multiple-screens/index.html"),
  ]);

  assert.match(
    tinydbUi,
    /href="\/analyzer\/\?source=tinydb-ui#export-aia"[\s\S]*?Run private audit/,
  );
  assert.match(
    debuggingGuide,
    /href="\/analyzer\/\?source=debugging-guide#export-aia"[\s\S]*?Check my literal tags/,
  );
  assert.match(
    crossScreenGuide,
    /href="\/analyzer\/\?source=cross-screen-guide#export-aia"[\s\S]*?Check my literal tags/,
  );
});

test("search-page audit prompts land on the analyzer export steps", async () => {
  const [analyzer, tinydbUi, debuggingGuide, crossScreenGuide] = await Promise.all([
    page("../analyzer/index.html"),
    page("../tinydb-ui/index.html"),
    page("../app-inventor-tinydb-not-working/index.html"),
    page("../app-inventor-tinydb-multiple-screens/index.html"),
  ]);

  assert.match(analyzer, /id="export-aia"[\s\S]*?Need the \.aia file first\?/);
  assert.match(
    analyzer,
    /Projects → Export selected project \(\.aia\) to my computer/,
  );
  assert.match(
    analyzer,
    /The file stays in this browser\. TinyDB Inspector never uploads it\./,
  );

  for (const searchPage of [tinydbUi, debuggingGuide, crossScreenGuide]) {
    assert.match(searchPage, /href="\/analyzer\/\?source=[^"]+#export-aia"/);
  }
});

test("existing search pages link to the dedicated cross-screen repair guide", async () => {
  const [tinydbUi, debuggingGuide] = await Promise.all([
    page("../tinydb-ui/index.html"),
    page("../app-inventor-tinydb-not-working/index.html"),
  ]);

  assert.match(
    tinydbUi,
    /href="\/app-inventor-tinydb-multiple-screens\/"[\s\S]*?App Inventor TinyDB multiple-screens repair guide/,
  );
  assert.match(
    debuggingGuide,
    /href="\/app-inventor-tinydb-multiple-screens\/"[\s\S]*?focused App Inventor TinyDB multiple-screens repair guide/,
  );
});
