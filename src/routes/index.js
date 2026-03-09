const { Router } = require("express");
const { unlink } = require("fs-extra");
const router = Router();

const cloudinary = require("cloudinary");
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Models
const Image = require("../models/Image");
const Categoria = require("../models/Categoria");

router.get("/", async (req, res, next) => {
    try {
        const images = await Image.find({ estado: true, cantidad: { $gt: 0 } });
        const categorias = await Categoria.find({ estado: true });
        res.render("index2", { images, categorias });
    } catch (err) {
        err.userMessage = "No se pudo cargar el catálogo de imágenes.";
        next(err);
    }
});

router.get("/cat/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const images = await Image.find({ estado: true, categoria: id });
        const categorias = await Categoria.find({ estado: true });
        res.render("index2", { images, categorias });
    } catch (err) {
        err.userMessage = "No se pudo cargar la categoría solicitada. Verifica que el ID sea válido.";
        next(err);
    }
});

router.get("/modecat", async (req, res, next) => {
    try {
        const categorias = await Categoria.find();
        res.render("cat", { categorias });
    } catch (err) {
        err.userMessage = "No se pudo cargar el panel de categorías.";
        next(err);
    }
});

router.post("/modecat", async (req, res, next) => {
    try {
        const categoria = new Categoria();
        categoria.nombre = req.body.nombre;
        categoria.codigo = req.body.codigo;
        await categoria.save();
        res.redirect("/modecat");
    } catch (err) {
        err.userMessage = "Error al crear la categoría. Verifica que el código y nombre sean correctos.";
        next(err);
    }
});

router.get("/mode", async (req, res, next) => {
    try {
        const images = await Image.find();
        const categorias = await Categoria.find({ estado: true });
        res.render("index", { images, categorias });
    } catch (err) {
        err.userMessage = "No se pudo cargar el panel de administración.";
        next(err);
    }
});

router.get("/mode/cat/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const images = await Image.find({ categoria: id });
        const categorias = await Categoria.find({ estado: true });
        res.render("index", { images, categorias });
    } catch (err) {
        err.userMessage = "No se pudo filtrar por categoría en el panel de administrador.";
        next(err);
    }
});

router.get("/update/:id", async (req, res, next) => {
    try {
        const image = await Image.findById(req.params.id);
        const categorias = await Categoria.find({ estado: true });
        res.render("update", { image, categorias });
    } catch (err) {
        err.userMessage = "No se encontró la imagen a editar. Puede que haya sido eliminada.";
        next(err);
    }
});

router.post("/update/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body };

        if (updateData.estado == null) {
            updateData.estado = false;
        }

        updateData.precioAnterior = updateData.precioAnterior || 0;

        // Si hay una nueva imagen cargada
        if (req.file) {
            const oldImage = await Image.findById(id);
            if (oldImage && oldImage.public_id) {
                // Borrar imagen anterior de Cloudinary
                await cloudinary.v2.uploader.destroy(oldImage.public_id);
            }

            // Subir nueva imagen
            const result = await cloudinary.v2.uploader.upload(req.file.path);
            updateData.path = result.secure_url;
            updateData.public_id = result.public_id;
            updateData.filename = req.file.filename;
            updateData.originalname = req.file.originalname;
            updateData.mimetype = req.file.mimetype;
            updateData.size = req.file.size;

            // Borrar archivo temporal local
            await unlink(req.file.path);
        }

        await Image.updateOne({ _id: id }, updateData);
        res.redirect("/mode");
    } catch (err) {
        err.userMessage = "Error al actualizar la imagen. Verifica los datos e intenta nuevamente.";
        next(err);
    }
});

router.get("/upload", async (req, res, next) => {
    try {
        const categorias = await Categoria.find({ estado: true });
        res.render("upload", { categorias });
    } catch (err) {
        err.userMessage = "No se pudo cargar el formulario de subida.";
        next(err);
    }
});

router.post("/upload", async (req, res, next) => {
    try {
        const image = new Image();
        const result = await cloudinary.v2.uploader.upload(req.file.path);
        image.title = req.body.title;
        image.precio = req.body.precio;
        image.precioAnterior = req.body.precioAnterior || 0;
        image.cantidad = req.body.cantidad;
        image.codigo = req.body.codigo;
        image.ciclo = req.body.ciclo;
        image.description = req.body.description;
        image.categoria = req.body.categoria;
        image.filename = req.file.filename;
        image.path = result.secure_url;
        image.public_id = result.public_id;
        image.originalname = req.file.originalname;
        image.mimetype = req.file.mimetype;
        image.size = req.file.size;
        await image.save();
        await unlink(req.file.path);
        res.redirect("/upload");
    } catch (err) {
        err.userMessage = "Error al subir la imagen. Verifica el archivo y tu conexión a Cloudinary.";
        next(err);
    }
});

router.get("/image/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const image = await Image.findById(id);
        const categorias = await Categoria.find({ estado: true });
        res.render("profile", { image, categorias });
    } catch (err) {
        err.userMessage = "No se encontró la imagen solicitada.";
        next(err);
    }
});

//Buscar privado
router.post("/search", async (req, res, next) => {
    try {
        const escaped = req.body.buscar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const q = new RegExp(`^.*${escaped}.*$`, 'i');
        const images = await Image.find({ title: q });
        const categorias = await Categoria.find({ estado: true });
        res.render("index", { images, categorias });
    } catch (err) {
        err.userMessage = "Error al realizar la búsqueda. Intenta con otros términos.";
        next(err);
    }
});

//Buscar publico
router.post("/search_pub", async (req, res, next) => {
    try {
        const escaped = req.body.buscar.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const q = new RegExp(`^.*${escaped}.*$`, 'i');
        const images = await Image.find({ title: q, estado: true });
        const categorias = await Categoria.find({ estado: true });
        res.render("index2", { images, categorias });
    } catch (err) {
        err.userMessage = "Error al realizar la búsqueda pública. Intenta con otros términos.";
        next(err);
    }
});

router.get("/image/:id/delete", async (req, res, next) => {
    try {
        const { id } = req.params;
        const imageDeleted = await Image.findByIdAndDelete(id);
        const result = await cloudinary.v2.uploader.destroy(imageDeleted.public_id, { invalidate: true });
        if (result.result !== 'ok') {
            console.error("Failed to delete image from Cloudinary");
        }
        res.redirect("/mode");
    } catch (err) {
        err.userMessage = "No se pudo eliminar la imagen. Puede que ya haya sido borrada o no exista en Cloudinary.";
        next(err);
    }
});

router.get("/categoria/:id/delete", async (req, res, next) => {
    try {
        const { id } = req.params;
        await Categoria.findByIdAndDelete(id);
        res.redirect("/modecat");
    } catch (err) {
        err.userMessage = "No se pudo eliminar la categoría. Puede que ya no exista.";
        next(err);
    }
});

module.exports = router;
