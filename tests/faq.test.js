import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const faqItems = [
  {
    question: "What does TinyDB Inspector find?",
    answer:
      "It maps literal TinyDB StoreValue and GetValue tags across project screens, flags likely naming mismatches, compares simple text, number, and boolean value types for exact tags, and highlights standard ClearTag and ClearAll calls. It cannot infer dynamic types, determine runtime order, or decide whether a warning is a bug.",
  },
  {
    question: "Does it upload my .aia file?",
    answer:
      "No. The analyzer reads the exported .aia file locally in your browser. Your project file is not uploaded.",
  },
  {
    question: "What does the fuller repair report add?",
    answer:
      "The optional fuller report expands the audit into a manually prepared issue summary, prioritized repair order, and retest checklist. It is an early paid offer, not a live checkout; you can ask about it from a completed audit.",
  },
];

test("the primary TinyDB page answers all three first-visit questions", async () => {
  const html = await readFile(
    new URL("../tinydb-ui/index.html", import.meta.url),
    "utf8",
  );

  for (const { question, answer } of faqItems) {
    assert.ok(html.includes(`<h3>${question}</h3>`));
    assert.ok(html.includes(answer));
  }
});

test("FAQ structured data matches the visible questions and answers", async () => {
  const html = await readFile(
    new URL("../tinydb-ui/index.html", import.meta.url),
    "utf8",
  );
  const rawStructuredData = html.match(
    /<script id="faq-structured-data" type="application\/ld\+json">([\s\S]*?)<\/script>/,
  )?.[1];

  assert.ok(rawStructuredData);

  const structuredData = JSON.parse(rawStructuredData);
  const structuredItems = structuredData.mainEntity.map((item) => ({
    question: item.name,
    answer: item.acceptedAnswer.text,
  }));

  assert.equal(structuredData["@type"], "FAQPage");
  assert.deepEqual(structuredItems, faqItems);
});
