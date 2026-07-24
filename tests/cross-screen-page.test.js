import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL(
  "../app-inventor-tinydb-multiple-screens/index.html",
  import.meta.url,
);

test("cross-screen guide owns the exact repair intent", async () => {
  const html = await readFile(pagePath, "utf8");

  assert.match(html, /App Inventor TinyDB multiple screens/);
  assert.match(html, /TinyDB1\.StoreValue/);
  assert.match(html, /TinyDB1\.GetValue/);
  assert.match(html, /profile_name/);
  assert.match(html, /profile-name/);
  assert.match(html, /Store fresh data and retest both screens/);
  assert.match(html, /Kodular TinyDB across multiple screens/);
});

test("cross-screen guide states the analyzer boundaries", async () => {
  const html = await readFile(pagePath, "utf8");

  assert.match(html, /tags assembled from text blocks/);
  assert.match(html, /value types/);
  assert.match(html, /default\s+values/);
  assert.match(html, /ClearTag or ClearAll/);
  assert.match(html, /does not claim full Kodular compatibility/);
  assert.match(
    html,
    /does not send the project file or its contents to a server/,
  );
});

test("cross-screen guide has canonical and structured page identity", async () => {
  const html = await readFile(pagePath, "utf8");
  const canonical =
    "https://tinproject-ydbq.vercel.app/app-inventor-tinydb-multiple-screens/";

  assert.match(html, new RegExp(`rel="canonical"[\\s\\S]*?href="${canonical}"`));
  assert.match(html, /"@type": "Article"/);
  assert.match(html, /"@type": "FAQPage"/);
});
