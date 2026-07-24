const textEncoder = new TextEncoder();

function uint16(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function uint32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return bytes;
}

function joinBytes(parts) {
  const size = parts.reduce((total, part) => total + part.byteLength, 0);
  const output = new Uint8Array(size);
  let offset = 0;

  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }

  return output;
}

export function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let localOffset = 0;

  for (const [name, input] of entries) {
    const nameBytes = textEncoder.encode(name);
    const content = input instanceof Uint8Array ? input : textEncoder.encode(input);
    const localHeader = joinBytes([
      uint32(0x04034b50),
      uint16(20),
      uint16(0),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(0),
      uint32(content.byteLength),
      uint32(content.byteLength),
      uint16(nameBytes.byteLength),
      uint16(0),
      nameBytes,
    ]);

    localParts.push(localHeader, content);
    centralParts.push(
      joinBytes([
        uint32(0x02014b50),
        uint16(20),
        uint16(20),
        uint16(0),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(0),
        uint32(content.byteLength),
        uint32(content.byteLength),
        uint16(nameBytes.byteLength),
        uint16(0),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(0),
        uint32(localOffset),
        nameBytes,
      ]),
    );
    localOffset += localHeader.byteLength + content.byteLength;
  }

  const centralDirectory = joinBytes(centralParts);
  const endOfCentralDirectory = joinBytes([
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(entries.length),
    uint16(entries.length),
    uint32(centralDirectory.byteLength),
    uint32(localOffset),
    uint16(0),
  ]);

  return joinBytes([...localParts, centralDirectory, endOfCentralDirectory]);
}
