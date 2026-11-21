export function pageRange(input: string, total: number) {
  if (!input.trim()) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>();
  for (const section of input.split(/[,，]/)) {
    const match = section.trim().match(/^(\d+)(?:\s*[-–—]\s*(\d+))?$/);
    const from = Number(match?.[1]), to = Number(match?.[2] ?? from);
    if (!match || from < 1 || to < from || to > total) throw Error(`请输入 1–${total} 之间的页码或页范围。`);
    for (let page = from; page <= to; page++) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}

const crcTable = Uint32Array.from({ length: 256 }, (_, i) => {
  let value = i;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc(bytes: Uint8Array) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}

function pngDensity(buffer: ArrayBuffer, dpi: number) {
  const chunk = new ArrayBuffer(21);
  const data = new DataView(chunk);
  data.setUint32(0, 9);
  data.setUint32(4, 0x70485973); // pHYs
  data.setUint32(8, Math.round(dpi / .0254));
  data.setUint32(12, Math.round(dpi / .0254));
  data.setUint8(16, 1);
  data.setUint32(17, crc(new Uint8Array(chunk, 4, 13)));
  const view = new DataView(buffer);
  const pieces: BlobPart[] = [buffer.slice(0, 33), chunk];
  for (let at = 33; at < buffer.byteLength;) {
    const end = at + view.getUint32(at) + 12;
    if (view.getUint32(at + 4) !== 0x70485973) pieces.push(buffer.slice(at, end));
    at = end;
  }
  return new Blob(pieces, { type: 'image/png' });
}

export async function rasterPage(svg: Blob, width: number, height: number, dpi: number, transparent: boolean) {
  const w = Math.round(width * dpi / 25.4), h = Math.round(height * dpi / 25.4);
  if (w > 16384 || h > 16384 || w * h > 65_000_000) throw Error('该纸幅和分辨率的像素数过大，请降低 DPI。');
  const url = URL.createObjectURL(svg);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const context = canvas.getContext('2d');
    if (!context) throw Error('无法创建图片。');
    if (!transparent) { context.fillStyle = '#fff'; context.fillRect(0, 0, w, h); }
    context.drawImage(img, 0, 0, w, h);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('无法生成 PNG。')), 'image/png'));
    canvas.width = canvas.height = 0;
    return pngDensity(await png.arrayBuffer(), dpi);
  } finally { URL.revokeObjectURL(url); }
}

export async function packPages(files: { name: string; blob: Blob }[]) {
  const encoder = new TextEncoder();
  const local: BlobPart[] = [], central: BlobPart[] = [];
  let offset = 0, directorySize = 0;
  for (const { name, blob } of files) {
    const filename = encoder.encode(name);
    const data = await blob.arrayBuffer();
    const checksum = crc(new Uint8Array(data));
    const header = new ArrayBuffer(30);
    const h = new DataView(header);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(6, 0x800, true);
    h.setUint32(14, checksum, true);
    h.setUint32(18, data.byteLength, true);
    h.setUint32(22, data.byteLength, true);
    h.setUint16(26, filename.length, true);
    const entry = new ArrayBuffer(46);
    const e = new DataView(entry);
    e.setUint32(0, 0x02014b50, true);
    e.setUint16(4, 20, true);
    new Uint8Array(entry, 6, 26).set(new Uint8Array(header, 4, 26));
    e.setUint32(42, offset, true);
    local.push(header, filename, data);
    central.push(entry, filename);
    offset += header.byteLength + filename.length + data.byteLength;
    directorySize += entry.byteLength + filename.length;
    if (offset > 0xffffffff) throw Error('输出超过 ZIP 大小上限，请分批导出。');
  }
  const finish = new ArrayBuffer(22);
  const footer = new DataView(finish);
  footer.setUint32(0, 0x06054b50, true);
  footer.setUint16(8, files.length, true);
  footer.setUint16(10, files.length, true);
  footer.setUint32(12, directorySize, true);
  footer.setUint32(16, offset, true);
  return new Blob([...local, ...central, finish], { type: 'application/zip' });
}
