import { Storage } from "@google-cloud/storage";
import path from "path";

const BUCKET_NAME = "elysian-images";

const LOCAL_GCS_KEY = path.resolve(
  process.cwd(),
  "src/config/gcs-key.json"
);

let storageSingleton;

function getStorage() {
  if (!storageSingleton) {
    storageSingleton =
      process.env.NODE_ENV === "production"
        ? new Storage()
        : new Storage({ keyFilename: LOCAL_GCS_KEY });
  }
  return storageSingleton;
}

function publicUrlForObject(objectName) {
  const encoded = objectName
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  return `https://storage.googleapis.com/${BUCKET_NAME}/${encoded}`;
}

function pathSegmentFromBody(value) {
  return String(value ?? "").replace(/\s+/g, "_");
}

/**
 * Upload a single image buffer to GCS. Public read is expected from bucket IAM.
 * Object path: {category}/{product_name}/{timestamp}-{originalname}
 * @param {Buffer} buffer
 * @param {string} originalName
 * @param {string} [mimetype]
 * @param {string} [category] from req.body.category
 * @param {string} [productName] from req.body.name
 * @returns {Promise<string>} Public https URL
 */
export async function uploadImageBufferToGcs(
  buffer,
  originalName,
  mimetype,
  category,
  productName
) {
  const categoryPart = pathSegmentFromBody(category);
  const productPart = pathSegmentFromBody(productName);
  const baseOriginal = path.basename(originalName || "image");
  const objectName = `${categoryPart}/${productPart}/${Date.now()}-${baseOriginal}`;

  const contentType =
    mimetype && typeof mimetype === "string" && mimetype.startsWith("image/")
      ? mimetype
      : mimetype || "application/octet-stream";

  const bucket = getStorage().bucket(BUCKET_NAME);
  const file = bucket.file(objectName);

  await new Promise((resolve, reject) => {
    const writeStream = file.createWriteStream({
      resumable: false,
      metadata: {
        contentType,
        cacheControl: "public, max-age=31536000",
      },
    });
    writeStream.on("error", reject);
    writeStream.on("finish", resolve);
    writeStream.end(buffer);
  });

  return publicUrlForObject(objectName);
}

/**
 * Extract GCS object name from a public URL for this bucket, or null if URL is not a match.
 * @param {string} url
 * @returns {string|null}
 */
export function objectNameFromStoragePublicUrl(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url.trim());
    if (u.hostname !== "storage.googleapis.com") return null;
    const segments = u.pathname.split("/").filter(Boolean);
    if (segments.length < 2) return null;
    if (segments[0] !== BUCKET_NAME) return null;
    return segments.slice(1).map((s) => decodeURIComponent(s)).join("/");
  } catch {
    return null;
  }
}

/**
 * Prefix for all image objects for one product (same as upload: type/productName/...).
 */
export function gcsProductImagePrefix(type, name) {
  const categoryPart = pathSegmentFromBody(type);
  const productPart = pathSegmentFromBody(name);
  if (!categoryPart || !productPart) return null;
  return `${categoryPart}/${productPart}/`;
}

/**
 * Remove every object under this product's path so the GCS "folder" has no objects left.
 * Also tries to remove a zero-byte "folder marker" object if present (name without trailing slash).
 */
export async function deleteAllGcsObjectsUnderProductPrefix(type, name) {
  const prefix = gcsProductImagePrefix(type, name);
  if (!prefix) return;
  const bucket = getStorage().bucket(BUCKET_NAME);

  const [files] = await bucket.getFiles({ prefix, autoPaginate: true });
  await Promise.all(
    files.map((f) => f.delete({ ignoreNotFound: true }))
  );

  const folderMarker = prefix.replace(/\/$/, "");
  await bucket.file(folderMarker).delete({ ignoreNotFound: true });
}

/** Delete every object in the configured bucket (used before full re-sync). */
export async function deleteAllObjectsInBucket() {
  const bucket = getStorage().bucket(BUCKET_NAME);
  await bucket.deleteFiles({ force: true });
}

/**
 * Best-effort delete of objects in this bucket from public URLs (non-GCS URLs are skipped).
 * @param {string[]} urls
 */
export async function deleteObjectsByPublicUrls(urls) {
  const unique = [
    ...new Set(
      (urls || []).filter((u) => typeof u === "string" && u.trim())
    ),
  ];
  const results = await Promise.allSettled(
    unique.map(async (url) => {
      const objectName = objectNameFromStoragePublicUrl(url);
      if (!objectName) return;
      const bucket = getStorage().bucket(BUCKET_NAME);
      await bucket.file(objectName).delete({ ignoreNotFound: true });
    })
  );
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.error(
      "GCS deleteObjectsByPublicUrls failures:",
      failed.map((f) => f.reason?.message || f.reason)
    );
  }
}
