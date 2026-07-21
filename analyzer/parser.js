const textDecoder = new TextDecoder();

export class AiaAnalysisError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "AiaAnalysisError";
    this.code = code;
  }
}

function analysisError(code, message) {
  return new AiaAnalysisError(code, message);
}

function readString(bytes, start, length) {
  return textDecoder.decode(bytes.subarray(start, start + length));
}

function findEndOfCentralDirectory(view) {
  const minimumOffset = Math.max(0, view.byteLength - 65_557);

  for (let offset = view.byteLength - 22; offset >= minimumOffset; offset -= 1) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      return offset;
    }
  }

  throw analysisError("invalid_archive", "This file is not a readable .aia project archive.");
}

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === "undefined") {
    throw analysisError("unsupported_compression", "This browser cannot open compressed .aia files yet.");
  }

  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function readZipEntries(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocdOffset = findEndOfCentralDirectory(view);
  const entryCount = view.getUint16(eocdOffset + 10, true);
  let centralOffset = view.getUint32(eocdOffset + 16, true);
  const entries = new Map();

  for (let index = 0; index < entryCount; index += 1) {
    if (view.getUint32(centralOffset, true) !== 0x02014b50) {
      throw analysisError("invalid_archive", "The .aia archive directory is damaged.");
    }

    const compression = view.getUint16(centralOffset + 10, true);
    const compressedSize = view.getUint32(centralOffset + 20, true);
    const fileNameLength = view.getUint16(centralOffset + 28, true);
    const extraLength = view.getUint16(centralOffset + 30, true);
    const commentLength = view.getUint16(centralOffset + 32, true);
    const localOffset = view.getUint32(centralOffset + 42, true);
    const name = readString(bytes, centralOffset + 46, fileNameLength);

    if (!name.endsWith("/")) {
      if (view.getUint32(localOffset, true) !== 0x04034b50) {
        throw analysisError("invalid_archive", `The archive entry ${name} is damaged.`);
      }

      const localNameLength = view.getUint16(localOffset + 26, true);
      const localExtraLength = view.getUint16(localOffset + 28, true);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = bytes.subarray(dataOffset, dataOffset + compressedSize);
      let content;

      if (compression === 0) {
        content = new Uint8Array(compressed);
      } else if (compression === 8) {
        content = await inflateRaw(compressed);
      } else {
        throw analysisError("unsupported_compression", `The archive uses unsupported compression for ${name}.`);
      }

      entries.set(name, content);
    }

    centralOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`${name}=["']([^"']+)["']`, "i"));
  return match?.[1] ?? "";
}

function componentMethodFragments(xml) {
  const fragments = [];
  const openingPattern = /<block\b[^>]*>/gi;
  let opening;

  while ((opening = openingPattern.exec(xml))) {
    if (attribute(opening[0], "type") !== "component_method") {
      continue;
    }

    const tokenPattern = /<\/?block\b[^>]*>/gi;
    tokenPattern.lastIndex = opening.index;
    let depth = 0;
    let token;

    while ((token = tokenPattern.exec(xml))) {
      if (token[0].startsWith("</")) {
        depth -= 1;
      } else if (!token[0].endsWith("/>")) {
        depth += 1;
      }

      if (depth === 0) {
        fragments.push(xml.slice(opening.index, tokenPattern.lastIndex));
        openingPattern.lastIndex = tokenPattern.lastIndex;
        break;
      }
    }
  }

  return fragments;
}

function literalValue(fragment, inputName) {
  const valuePattern = new RegExp(
    `<value\\b[^>]*name=["']${inputName}["'][^>]*>([\\s\\S]*?)<\\/value>`,
    "i",
  );
  const valueFragment = fragment.match(valuePattern)?.[1];
  if (!valueFragment) return null;

  const field = valueFragment.match(
    /<field\b[^>]*name=["']TEXT["'][^>]*>([\s\S]*?)<\/field>/i,
  );
  return field ? field[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim() : null;
}

function screenFromPath(path) {
  return path.split("/").at(-1).replace(/\.bky$/i, "");
}

export function extractTinyDbUsage(xml, screen) {
  const usages = [];

  for (const fragment of componentMethodFragments(xml)) {
    const openingTag = fragment.match(/<block\b[^>]*>/i)?.[0] ?? "";
    const mutationTag = fragment.match(/<mutation\b[^>]*>/i)?.[0] ?? "";
    const componentType = attribute(mutationTag, "component_type");
    const methodName = attribute(mutationTag, "method_name");

    if (componentType !== "TinyDB" || !["StoreValue", "GetValue"].includes(methodName)) {
      continue;
    }

    const tag = literalValue(fragment, "ARG0");
    if (!tag) continue;

    usages.push({
      screen,
      tag,
      operation: methodName === "StoreValue" ? "store" : "get",
      defaultValue: methodName === "GetValue" ? literalValue(fragment, "ARG1") : null,
      blockId: attribute(openingTag, "id"),
    });
  }

  return usages;
}

function normalizedTag(tag) {
  return tag.toLocaleLowerCase().replace(/[^a-z0-9]/g, "");
}

export function buildAudit(usages) {
  const screens = new Map();
  const tagNames = [...new Set(usages.map(({ tag }) => tag))];
  const issues = [];

  for (const usage of usages) {
    if (!screens.has(usage.screen)) screens.set(usage.screen, []);
    screens.get(usage.screen).push(usage);
  }

  for (let first = 0; first < tagNames.length; first += 1) {
    for (let second = first + 1; second < tagNames.length; second += 1) {
      const left = tagNames[first];
      const right = tagNames[second];
      if (normalizedTag(left) !== normalizedTag(right) || left === right) continue;

      const leftUsages = usages.filter(({ tag }) => tag === left);
      const rightUsages = usages.filter(({ tag }) => tag === right);
      const screenNames = new Set([...leftUsages, ...rightUsages].map(({ screen }) => screen));
      if (screenNames.size < 2) continue;

      const preferred = leftUsages.some(({ operation }) => operation === "store") ? left : right;
      const alternate = preferred === left ? right : left;
      issues.push({
        type: "tag_mismatch",
        severity: "high",
        tags: [left, right],
        screens: [...screenNames],
        title: `Align “${alternate}” with “${preferred}”`,
        detail: `These tags differ only by punctuation, so one screen can save data that another screen never reads. Rename “${alternate}” to “${preferred}” and test the flow again.`,
      });
    }
  }

  return {
    screens: [...screens.entries()].map(([name, screenUsages]) => ({
      name,
      usages: screenUsages,
    })),
    usages,
    issues,
  };
}

export async function analyzeAia(input) {
  const entries = await readZipEntries(input);
  const blockFiles = [...entries.entries()].filter(([path]) => path.endsWith(".bky"));

  if (blockFiles.length === 0) {
    throw analysisError("invalid_project", "No App Inventor block files were found in this project.");
  }

  const usages = blockFiles.flatMap(([path, content]) =>
    extractTinyDbUsage(textDecoder.decode(content), screenFromPath(path)),
  );

  if (usages.length === 0) {
    throw analysisError("no_literal_tags", "No literal TinyDB StoreValue or GetValue tags were found.");
  }

  return buildAudit(usages);
}
