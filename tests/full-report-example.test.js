import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("completed audit results show the worked report beside the interest action", async () => {
  const analyzer = await page("../analyzer/index.html");

  assert.match(
    analyzer,
    /class="report-links"[\s\S]*?href="\/tinydb-fuller-report-example\/"[\s\S]*?See a worked report example[\s\S]*?id="full-report-link"[\s\S]*?Ask about a fuller repair report/,
  );
  assert.match(analyzer, /manually prepared example before you ask/);
});

test("the public example is a manual report based only on the prepared sample", async () => {
  const example = await page("../tinydb-fuller-report-example/index.html");

  assert.match(example, /Worked report example/);
  assert.match(example, /prepared from TinyDB Inspector's public two-screen sample/);
  assert.match(example, /Fuller reports are manually prepared/);
  assert.match(example, /profile_name/);
  assert.match(example, /profile-name/);
  assert.match(example, /Prioritized repair/);
  assert.match(example, /Retest checklist/);
  assert.match(example, /Project contents[\s\S]*?are not uploaded/);
  assert.doesNotMatch(example, /\$29|checkout/);
});
