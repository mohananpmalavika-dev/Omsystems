import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";

const allowed = new Map([
  ["image/png", "png"], ["image/jpeg", "jpg"], ["image/svg+xml", "svg"], ["application/pdf", "pdf"],
]);

export class DigitalTwinAssetStore {
  constructor(private readonly root: string) {}

  async save(input: { floorId: string; contentType: string; dataBase64: string; originalFilename: string }) {
    const extension = allowed.get(input.contentType);
    if (!extension) throw new TwinAssetError("unsupported_floor_plan_type", 415);
    const data = decode(input.dataBase64);
    if (data.byteLength === 0 || data.byteLength > 25 * 1024 * 1024) throw new TwinAssetError("floor_plan_size_invalid", 413);
    validateMagic(data, input.contentType);
    if (input.contentType === "image/svg+xml") validateSvg(data.toString("utf8"));
    const storageKey = `${input.floorId}/${randomUUID()}.${extension}`;
    const path = this.path(storageKey);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, data, { flag: "wx" });
    return { storageKey, size: data.byteLength, extension, originalFilename: safeFilename(input.originalFilename, extension) };
  }

  async read(storageKey: string) { return readFile(this.path(storageKey)); }

  private path(storageKey: string) {
    if (!/^[a-f0-9-]{20,50}\/[a-f0-9-]{20,50}\.(png|jpg|svg|pdf)$/i.test(storageKey)) throw new TwinAssetError("invalid_storage_key", 400);
    const root = resolve(this.root);
    const result = resolve(join(root, storageKey));
    if (!result.startsWith(`${root}\\`) && !result.startsWith(`${root}/`)) throw new TwinAssetError("invalid_storage_key", 400);
    return result;
  }
}

export class TwinAssetError extends Error {
  constructor(public readonly code: string, public readonly statusCode: number) { super(code); }
}

function decode(value: string) {
  const data = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  if (!/^[a-zA-Z0-9+/=\r\n]+$/.test(data)) throw new TwinAssetError("floor_plan_encoding_invalid", 400);
  return Buffer.from(data, "base64");
}
function validateMagic(data: Buffer, type: string) {
  const valid = type === "image/png" ? data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : type === "image/jpeg" ? data[0] === 0xff && data[1] === 0xd8
      : type === "application/pdf" ? data.subarray(0, 5).toString() === "%PDF-"
        : /^\s*<\?xml|^\s*<svg/i.test(data.subarray(0, 512).toString("utf8"));
  if (!valid) throw new TwinAssetError("floor_plan_content_invalid", 422);
}
function validateSvg(value: string) {
  if (/<script|<foreignObject|javascript:|\son[a-z]+\s*=|https?:\/\//i.test(value)) throw new TwinAssetError("unsafe_svg_content", 422);
}
function safeFilename(value: string, extension: string) {
  const base = value.replace(extname(value), "").replace(/[^a-zA-Z0-9._ -]+/g, "").trim().slice(0, 100) || "floor-plan";
  return `${base}.${extension}`;
}
