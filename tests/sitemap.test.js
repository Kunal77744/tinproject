import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sitemapPath = new URL("../sitemap.xml", import.meta.url);
const productionOrigin = "https://tinproject-ydbq.vercel.app";

test("sitemap includes the three Cycle 5 search pages", async () => {
  const sitemap = await readFile(sitemapPath, "utf8");

  assert.match(
    sitemap,
    new RegExp(
      `<loc>${productionOrigin}/tinydb-ui/</loc>`,
    ),
  );
  assert.match(
    sitemap,
    new RegExp(
      `<loc>${productionOrigin}/app-inventor-tinydb-not-working/</loc>`,
    ),
  );
  assert.match(
    sitemap,
    new RegExp(
      `<loc>${productionOrigin}/app-inventor-tinydb-multiple-screens/</loc>`,
    ),
  );
});

test("sitemap uses only canonical production URLs", async () => {
  const sitemap = await readFile(sitemapPath, "utf8");
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(
    ([, url]) => url,
  );

  assert.deepEqual(urls, [
    `${productionOrigin}/`,
    `${productionOrigin}/analyzer/`,
    `${productionOrigin}/tinydb-ui/`,
    `${productionOrigin}/app-inventor-tinydb-not-working/`,
    `${productionOrigin}/app-inventor-tinydb-multiple-screens/`,
  ]);
});
