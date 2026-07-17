require("dotenv").config();
const express = require("express");
const morgan = require("morgan");
const { unlink } = require("fs-extra");
const { loadAdminSession } = require("./middlewares/adminAuth");

const path = require("path");

// intializations
const app = express();
require("./database");

// settings
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "ejs");
app.set("port", process.env.PORT || 3000);
if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

// middlewares
app.use(morgan("dev"));
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: false }));
app.use(loadAdminSession);

// Global variables
app.use((req, res, next) => {
  res.locals.currentPath = req.path;
  next();
});

// routes
app.use(require("./routes/adminAuth"));
app.use(require("./routes/index"));

// static files
app.use(express.static(path.join(__dirname, "public")));

// Global error handler
app.use(async (err, req, res, next) => {
    console.error(`[ERROR] ${req.method} ${req.path} →`, err.stack);

    if (req.file && req.file.path) {
        try {
            await unlink(req.file.path);
        } catch (cleanupError) {
            if (cleanupError.code !== "ENOENT") {
                console.error("No se pudo limpiar el archivo temporal:", cleanupError.message);
            }
        }
    }

  let message = err.userMessage || "Ocurrió un error inesperado. Por favor, intenta nuevamente.";

  // Manejo específico para errores de Multer (tamaño de archivo)
  if (err.code === 'LIMIT_FILE_SIZE') {
    message = "La imagen es demasiado pesada. El límite máximo es de 10MB.";
  } else if (err.code === 'INVALID_IMAGE_TYPE') {
    message = "La imagen debe estar en formato JPG, PNG o WebP.";
  }

  res.status(err.status || 500).send(`
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
