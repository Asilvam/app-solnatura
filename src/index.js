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
app.use(multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
}).single("image"));

// Global variables
app.use((req, res, next) => {
  next();
});

// routes
app.use(require("./routes/index"));

// static files
app.use(express.static(path.join(__dirname, "public")));

// Global error handler
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path} →`, err.stack);

  let message = err.userMessage || "Ocurrió un error inesperado. Por favor, intenta nuevamente.";

  // Manejo específico para errores de Multer (tamaño de archivo)
  if (err.code === 'LIMIT_FILE_SIZE') {
    message = "La imagen es demasiado pesada. El límite máximo es de 10MB.";
  }

  res.status(500).send(`
    <div style="font-family: sans-serif; padding: 2rem; max-width: 600px; margin: auto; text-align: center;">
      <h2 style="color: #c0392b;">⚠️ Error de Subida</h2>
      <p style="color: #333; font-size: 1.1rem;">${message}</p>
      <a href="javascript:history.back()" style="display: inline-block; margin-top: 1rem; padding: 0.5rem 1.5rem; background-color: #27ae60; color: white; text-decoration: none; border-radius: 20px; font-weight: bold;">← Volver a intentar</a>
    </div>
  `);
});

//starting server
app.listen(app.get("port"), () => {
  console.log("Server ON");
});
