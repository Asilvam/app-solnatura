const { randomUUID } = require("crypto");
const path = require("path");
const multer = require("multer");

const IMAGE_EXTENSIONS = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
};

const ALLOWED_IMAGE_TYPES = new Set(Object.keys(IMAGE_EXTENSIONS));

const storage = multer.diskStorage({
    destination: path.join(__dirname, "../public/img/uploads"),
    filename: (req, file, cb) => {
        const extension = IMAGE_EXTENSIONS[file.mimetype] || path.extname(file.originalname).toLowerCase();
        cb(null, randomUUID() + extension);
    },
});

module.exports = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (ALLOWED_IMAGE_TYPES.has(file.mimetype)) return cb(null, true);

        const error = new Error("Tipo de imagen no permitido");
        error.code = "INVALID_IMAGE_TYPE";
        error.userMessage = "La imagen debe estar en formato JPG, PNG o WebP.";
        cb(error);
    },
});
