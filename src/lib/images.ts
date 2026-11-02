import "server-only";
import sharp, { type Metadata } from "sharp";
import { LIMITS } from "@/lib/config";

const ALLOWED_FORMATS = new Set(["png", "jpeg", "webp"]);
const ALLOWED_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);

export class UploadError extends Error {}

/**
 * Validates an uploaded screenshot by decoding it (not by trusting the extension
 * or MIME type) and returns a normalized PNG for storage plus a downscaled PNG
 * for model input.
 */
export async function normalizeReference(buf: Buffer, mime: string) {
  if (buf.length === 0) throw new UploadError("The file is empty.");
  if (buf.length > LIMITS.maxUploadBytes) {
    throw new UploadError(`The image is larger than ${LIMITS.maxUploadBytes / 1024 / 1024} MB.`);
  }
  if (!ALLOWED_MIME.has(mime)) throw new UploadError("Only PNG, JPEG and WebP images are supported.");

  let meta: Metadata;
  try {
    meta = await sharp(buf, { limitInputPixels: LIMITS.maxImagePixels }).metadata();
  } catch {
    throw new UploadError("The file could not be decoded as an image.");
  }
  if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) {
    throw new UploadError("Only PNG, JPEG and WebP images are supported.");
  }
  if (!meta.width || !meta.height || meta.width < 64 || meta.height < 64) {
    throw new UploadError("The image is too small (minimum 64×64).");
  }

  // Apply EXIF orientation, drop metadata, flatten transparency onto white.
  const base = sharp(buf, { limitInputPixels: LIMITS.maxImagePixels }).rotate().flatten({ background: "#ffffff" });
  const png = await base.clone().png().toBuffer();
  const info = await sharp(png).metadata();
  const width = info.width ?? meta.width;
  const height = info.height ?? meta.height;

  const modelPng = await sharp(png)
    .resize({ width: LIMITS.modelImageLongEdge, height: LIMITS.modelImageLongEdge, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();

  return { png, modelPng, width, height };
}

/** Downscales any PNG for model input (used for rendered previews). */
export async function toModelPng(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .resize({ width: LIMITS.modelImageLongEdge, height: LIMITS.modelImageLongEdge, fit: "inside", withoutEnlargement: true })
    .png()
    .toBuffer();
}

export async function imageSize(buf: Buffer) {
  const m = await sharp(buf).metadata();
  return { width: m.width ?? 0, height: m.height ?? 0 };
}
