import multer from "multer";

const storage = multer.memoryStorage();

function fileFilter(req, file, cb) {
  if (file.mimetype && file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image uploads are allowed"));
  }
}

/** multipart field name: images (multiple files). */
export const uploadProductImagesMulter = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024, files: 30 },
  fileFilter,
}).array("images", 30);
