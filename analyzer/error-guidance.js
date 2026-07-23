const guidance = {
  invalid_archive:
    "We couldn't read this as an exported .aia project. Export the project again from App Inventor, then choose the new .aia file.",
  invalid_project:
    "This .aia doesn't contain App Inventor block files we can inspect. Export the project again from App Inventor, then choose the new .aia file.",
  unsupported_compression:
    "This .aia uses archive compression that this browser can't open. Re-export it from App Inventor, or try the latest Chrome or Edge.",
  no_literal_tags:
    "We opened the project, but found no literal TinyDB StoreValue or GetValue tags to map. If your tags use variables or text joins, review them manually because this audit doesn't analyze dynamic tags yet.",
};

export function auditErrorCode(error) {
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    Object.hasOwn(guidance, error.code)
  ) {
    return error.code;
  }

  return "unknown_error";
}

export function guidanceForAuditError(error) {
  const errorCode = auditErrorCode(error);
  if (errorCode !== "unknown_error") {
    return guidance[errorCode];
  }

  return "We couldn't inspect this project. Export a fresh .aia from App Inventor and try again.";
}
