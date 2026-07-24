export const SUPPORT_ADDRESS = "tinproject-ydbq@mail.tin.computer";

export function shouldOfferLocalAudit(source) {
  return source === "sample";
}

export function createAuditResult(audit) {
  if (audit.issues.length) {
    return {
      title: "Repair checklist",
      intro:
        "Fix the highest-confidence mismatch first, then rerun the audit and test the affected screens.",
      items: audit.issues,
    };
  }

  const screenLabel = audit.screens.length === 1 ? "screen" : "screens";

  return {
    title: "Next-step checklist",
    intro:
      "The literal naming check is clear. Use these manual checks before you treat the TinyDB flow as ready.",
    items: [
      {
        status: "passed",
        title: "Literal tag naming check complete",
        detail: `The analyzer compared literal TinyDB StoreValue and GetValue tags across ${audit.screens.length} ${screenLabel} and found no likely case or punctuation mismatch. This check does not guarantee the project is bug-free.`,
      },
      {
        status: "manual",
        title: "Check tags built at runtime",
        detail:
          "Inspect tags made with variables or text joins and confirm they produce the same text on every screen. Dynamic tag values are not analyzed yet.",
      },
      {
        status: "manual",
        title: "Check value types and defaults",
        detail:
          "Confirm each StoreValue writes the type its matching GetValue expects, and that every fallback default uses that type. Types and defaults are not checked yet.",
      },
      {
        status: "manual",
        title: "Check destructive clears",
        detail:
          "Find ClearTag and ClearAll blocks and confirm they cannot erase shared data unexpectedly. Destructive clears are not checked yet.",
      },
    ],
  };
}

export function createRepairSummary(audit) {
  const heading = "TinyDB repair summary";
  const result = createAuditResult(audit);
  const steps = result.items.map(
    (item, index) => `${index + 1}. ${item.title}\n${item.detail}`,
  );
  const followUp = audit.issues.length
    ? "Rerun the browser-only audit after making the change."
    : "Rerun the browser-only audit after any TinyDB change.";

  return [heading, ...steps, followUp].join("\n\n");
}

export function createFullReportMailto() {
  const subject = "TinyDB fuller repair report";
  const body = [
    "Hi,",
    "",
    "I'd like to ask about a fuller TinyDB repair report.",
    "",
    "Thanks",
  ].join("\n");

  return `mailto:${SUPPORT_ADDRESS}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
