require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const multer = require("multer");
const { v4: uuidv4 } = require('uuid');

const path = require("path");

// intializations
const app = express();
require("./database");

// settings
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.set("port", process.env.PORT || 3000);

// middlewares
app.use(morgan("dev"));
app.use(express.urlencoded({ extended: false }));
const storage = multer.diskStorage({
  destination: path.join(__dirname, "public/img/uploads"),
  filename: (req, file, cb, filename) => {
    console.log(file);
    cb(null, uuidv4() + path.extname(file.originalname));
  },
});
app.use(multer({ storage }).single("image"));

// Global variables
app.use((req, res, next) => {
  next();
});

// routes
app.use(require("./routes/index"));

// static files
app.use(express.static(path.join(__dirname, "public")));

// Global error handler (must have 4 params for Express to recognize it as error handler)
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path} →`, err.stack);
  const message = err.userMessage || "Ocurrió un error inesperado. Por favor, intenta nuevamente.";
  res.status(500).send(`
    <div style="font-family: sans-serif; padding: 2rem; max-width: 600px; margin: auto;">
      <h2 style="color: #c0392b;">⚠️ Error</h2>
      <p style="color: #333;">${message}</p>
      <a href="javascript:history.back()" style="color: #2980b9;">← Volver</a>
    </div>
  `);
});

//starting server
app.listen(app.get("port"), () => {
  console.log("Server ON");
});
