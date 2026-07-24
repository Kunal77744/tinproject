export const SUPPORT_ADDRESS = "tinproject-ydbq@mail.tin.computer";

export function shouldOfferLocalAudit(source) {
  return source === "sample";
}

function createClearWarning(clear) {
  const component = clear.component || "TinyDB";

  if (clear.operation === "clear_all") {
    return {
      status: "warning",
      title: `Review ${component}.ClearAll on ${clear.screen}`,
      detail: `${clear.screen} uses ${component}.ClearAll. When this block runs, it can remove every tag in that TinyDB component's current store or namespace. Confirm the event and timing are intentional. This audit cannot determine when the block runs or whether the clear is a bug.`,
    };
  }

  return {
    status: "warning",
    title: `Review ClearTag for “${clear.tag}”`,
    detail: `${clear.screen} uses ${component}.ClearTag for the literal tag “${clear.tag}”. When this block runs, it removes that tag's stored value. Confirm the event and timing are intentional. This audit cannot determine when the block runs or whether the clear is a bug.`,
  };
}

export function createAuditResult(audit) {
  const clearWarnings = audit.clears.map(createClearWarning);
  const namingIssues = audit.issues.filter(
    ({ type }) => type === "tag_mismatch",
  );
  const typeWarnings = audit.issues.filter(
    ({ type }) => type === "literal_type_conflict",
  );

  if (audit.issues.length) {
    let title = "Repair checklist";
    let intro =
      "Fix the highest-confidence mismatch first, then rerun the audit and test the affected screens.";

    if (namingIssues.length === 0) {
      title = "Type review";
      intro =
        "Review the conflicting static literal types before you test the affected TinyDB flow.";
    } else if (typeWarnings.length > 0) {
      intro =
        "Fix the likely naming mismatch first, then review the static literal types and test the affected screens.";
    }

    if (clearWarnings.length > 0) {
      intro = `${intro} Review each clear call before you rerun the audit.`;
    }

    return {
      title,
      intro,
      items: [...audit.issues, ...clearWarnings],
    };
  }

  const tagScreens = new Set(audit.tagUsages.map(({ screen }) => screen));
  const screenLabel = tagScreens.size === 1 ? "screen" : "screens";
  const passedItems = [];

  if (audit.tagUsages.length > 0) {
    passedItems.push({
      status: "passed",
      title: "Literal tag naming check complete",
      detail: `The analyzer compared literal TinyDB StoreValue and GetValue tags across ${tagScreens.size} ${screenLabel} and found no likely case or punctuation mismatch. This check does not guarantee the project is bug-free.`,
    });
  }

  if (clearWarnings.length === 0) {
    passedItems.push({
      status: "passed",
      title: "Static clear-call check complete",
      detail:
        "The analyzer found no standard TinyDB ClearTag or ClearAll calls in the mapped blocks. It does not analyze runtime ordering or dynamic and generic component calls.",
    });
  }

  if (audit.literalTypeUsages.length > 0) {
    passedItems.push({
      status: "passed",
      title: "Static literal type check complete",
      detail:
        "The analyzer compared simple text, number, and boolean StoreValue values and matching GetValue defaults for each exact tag and found no conflict. It does not infer dynamic or runtime types.",
    });
  }

  return {
    title: clearWarnings.length > 0 ? "Clear-call review" : "Next-step checklist",
    intro:
      clearWarnings.length > 0
        ? "No likely literal naming mismatch was found. Review each clear call before you treat the TinyDB flow as ready."
        : "The literal naming, simple static type, and clear-call checks are clear. Use these manual checks before you treat the TinyDB flow as ready.",
    items: [
      ...passedItems,
      ...clearWarnings,
      {
        status: "manual",
        title: "Check tags built at runtime",
        detail:
          "Inspect tags made with variables or text joins and confirm they produce the same text on every screen. Dynamic tag values are not analyzed yet.",
      },
      {
        status: "manual",
        title: "Check dynamic value types and defaults",
        detail:
          "Confirm values made with variables, joins, lists, objects, or other expressions use the type each matching GetValue expects. The static check covers only simple text, number, and boolean literals.",
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
