import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pages = [
  {
    path: new URL("../index.html", import.meta.url),
    title: "TinyDB Inspector for App Inventor Projects",
    description:
      "Inspect literal TinyDB tags in an App Inventor .aia project, catch likely naming mismatches, and get a focused repair step without uploading.",
  },
  {
    path: new URL("../analyzer/index.html", import.meta.url),
    title: "Private App Inventor TinyDB Analyzer | TinyDB Inspector",
    description:
      "Audit a local .aia file in your browser. Map literal TinyDB tags, catch naming and simple literal-type conflicts, and review clear calls without uploading.",
  },
  {
    path: new URL("../tinydb-ui/index.html", import.meta.url),
    title: "TinyDB UI for App Inventor and Kodular | TinyDB Inspector",
    description:
      "See how a browser-based TinyDB UI maps literal StoreValue and GetValue tags across App Inventor and Kodular screens and highlights likely naming mismatches.",
  },
  {
    path: new URL(
      "../app-inventor-tinydb-not-working/index.html",
      import.meta.url,
    ),
    title: "App Inventor TinyDB Not Working? Debug It | TinyDB Inspector",
    description:
      "App Inventor TinyDB not working? Check why data is not storing or retrieving, repair cross-screen tag mismatches, and run a private literal-tag audit.",
  },
  {
    path: new URL(
      "../app-inventor-tinydb-multiple-screens/index.html",
      import.meta.url,
    ),
    title:
      "App Inventor TinyDB Multiple Screens: Fix Tags | TinyDB Inspector",
    description:
      "Fix App Inventor TinyDB across multiple screens. Compare literal StoreValue and GetValue tags, rename mismatches, and retest the same data flow.",
  },
];

function metadataFrom(html) {
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = html.match(
    /<meta\s+name="description"\s+content="([^"]+)"\s*\/?>/s,
  )?.[1];

  return { title, description };
}

test("core pages have distinct, intent-specific search metadata", async () => {
  const metadata = [];

  for (const page of pages) {
    const html = await readFile(page.path, "utf8");
    const actual = metadataFrom(html);

    assert.deepEqual(actual, {
      title: page.title,
      description: page.description,
    });
    metadata.push(actual);
  }

  assert.equal(new Set(metadata.map(({ title }) => title)).size, pages.length);
  assert.equal(
    new Set(metadata.map(({ description }) => description)).size,
    pages.length,
  );
});

test("the live analyzer is eligible for search indexing", async () => {
  const html = await readFile(pages[1].path, "utf8");

  assert.doesNotMatch(
    html,
    /<meta\s+name="robots"\s+content="[^"]*noindex[^"]*"\s*\/?>/i,
  );
});
