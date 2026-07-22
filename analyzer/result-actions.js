export const SUPPORT_ADDRESS = "tinproject-ydbq@mail.tin.computer";

export function shouldOfferLocalAudit(source) {
  return source === "sample";
}

export function createRepairSummary(audit) {
  const heading = "TinyDB repair summary";
  const steps = audit.issues.length
    ? audit.issues.map((issue, index) => `${index + 1}. ${issue.title}\n${issue.detail}`)
    : [
        "1. No likely cross-screen mismatch found",
        "Review dynamic tag values manually before shipping.",
      ];

  return [heading, ...steps, "Rerun the browser-only audit after making the change."].join("\n\n");
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
