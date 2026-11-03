/** A stored ZIP preserves the parser-verified artifact bytes without re-encoding. */
export function zipCampaignHandoff(verifiedArchive: Uint8Array): Uint8Array {
  const archive = JSON.parse(new TextDecoder().decode(verifiedArchive)) as {
    files: { path: string; base64: string; approvalStatus: string }[];
  };
  if (archive.files.some((file) => file.approvalStatus !== "approved"))
    throw new Error("Only approved artifacts can be packaged.");
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const file of archive.files) {
    if (
      !/^[a-zA-Z0-9._/-]+$/.test(file.path) ||
      file.path.startsWith("/") ||
      file.path.split("/").some((part) => part === ".." || part === "")
    )
      throw new Error("Invalid archive path.");
    const name = new TextEncoder().encode(file.path);
    const data = Uint8Array.from(atob(file.base64), (value) => value.charCodeAt(0));
    const crc = crc32(data);
    const header = new Uint8Array(30 + name.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x800, true);
    view.setUint16(12, 33, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, name.length, true);
    header.set(name, 30);
    const directory = new Uint8Array(46 + name.length);
    const dv = new DataView(directory.buffer);
    dv.setUint32(0, 0x02014b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 20, true);
    dv.setUint16(8, 0x800, true);
    dv.setUint16(14, 33, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, data.length, true);
    dv.setUint32(24, data.length, true);
    dv.setUint16(28, name.length, true);
    dv.setUint32(42, offset, true);
    directory.set(name, 46);
    local.push(header, data);
    central.push(directory);
    offset += header.length + data.length;
  }
  const centralSize = central.reduce((size, part) => size + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const output = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  for (const part of [...local, ...central, end]) {
    output.set(part, cursor);
    cursor += part.length;
  }
  return output;
}
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
