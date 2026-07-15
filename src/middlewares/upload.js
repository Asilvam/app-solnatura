const { randomUUID } = require("crypto");
const path = require("path");
const multer = require("multer");

const storage = multer.diskStorage({
    destination: path.join(__dirname, "../public/img/uploads"),
    filename: (req, file, cb) => {
        cb(null, randomUUID() + path.extname(file.originalname));
    },
});

module.exports = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 },
});
