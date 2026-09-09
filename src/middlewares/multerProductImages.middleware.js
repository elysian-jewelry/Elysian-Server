import multer from "multer";

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (file.mimetype && file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image uploads are allowed"));
  }
}

/**
 * multipart field name: images (multiple files).
 *
 * Buffers land in memory (memoryStorage), so these limits are what stands
 * between an upload and the instance's heap. The previous 15 MB x 30 allowed
 * 450 MB per request — roughly 1.8x the whole 256 MB F1 instance, so an
 * accepted request was an OOM kill rather than a slow one.
 *
 * The numbers below mirror the admin client exactly (MAX_ADD_PRODUCT_IMAGES
 * = 5, MAX_IMAGE_BYTES = 15 MB), so nothing the form accepts is rejected
 * here, and the worst case is 75 MB instead of 450 MB.
 *
 * `fields` and `parts` bound the non-file half of the body, which had no
 * limit at all: `parts` is files + fields, so 40 leaves headroom over the
 * 5 + 20 this endpoint actually uses.
 */
export const uploadProductImagesMulter = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15 MB per image — matches the client
    files: 5,                   // 5 files per request (<= 75 MB total)
    fields: 20,
    parts: 40,
  },
  fileFilter,
}).array("images", 5);
