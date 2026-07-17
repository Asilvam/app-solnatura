const { Router } = require("express");
const { unlink } = require("fs-extra");
const { Types } = require("mongoose");
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
const Pedido = require("../models/Pedido");

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
        const existingImage = await Image.findById(id).select("estado");

        if (!existingImage) {
            const err = new Error("Producto no encontrado.");
            err.userMessage = err.message;
            return next(err);
        }

        if (updateData.estado == null) {
            updateData.estado = false;
        }

        const nextEstado = updateData.estado === true || updateData.estado === "true" || updateData.estado === "on";
        console.info(`[PRODUCTO-ESTADO] Cambio solicitado producto=${id} estadoActual=${existingImage.estado} estadoNuevo=${nextEstado}`);

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
        console.info(`[PRODUCTO-ESTADO] Estado actualizado producto=${id} estado=${nextEstado}`);
        res.redirect("/mode");
    } catch (err) {
        console.error(`[PRODUCTO-ESTADO] Error al actualizar producto=${req.params.id}: ${err.message}`);
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
        if (result.result !== "ok") {
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

// Stock management: show all products with low/zero stock
router.get("/mode/stock", async (req, res, next) => {
    try {
        const images = await Image.find({ $or: [{ cantidad: { $lte: 0 } }, { cantidad: { $exists: false } }, { cantidad: null }] });
        const categorias = await Categoria.find({ estado: true });
        res.render("index", { images, categorias });
    } catch (err) {
        err.userMessage = "No se pudo cargar la vista de stock bajo.";
        next(err);
    }
});

// Stock management: show adjustment form for a specific product
router.get("/stock/:id", async (req, res, next) => {
    try {
        const image = await Image.findById(req.params.id);
        if (!image) {
            const err = new Error("Producto no encontrado.");
            err.userMessage = err.message;
            return next(err);
        }
        const categorias = await Categoria.find({ estado: true });
        res.render("stock", { image, categorias });
    } catch (err) {
        err.userMessage = "No se encontró el producto para ajustar su stock.";
        next(err);
    }
});

// Stock management: apply stock adjustment
router.post("/stock/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const { operacion, cantidad } = req.body;
        const ajuste = parseInt(cantidad, 10);

        if (isNaN(ajuste) || ajuste < 0) {
            const err = new Error("La cantidad debe ser un número válido mayor o igual a cero.");
            err.userMessage = err.message;
            return next(err);
        }

        const product = await Image.findById(id);
        if (!product) {
            const err = new Error("Producto no encontrado.");
            err.userMessage = err.message;
            return next(err);
        }

        let nuevoStock = product.cantidad || 0;
        if (operacion === "agregar") {
            nuevoStock += ajuste;
        } else if (operacion === "restar") {
            nuevoStock = Math.max(0, nuevoStock - ajuste);
        } else {
            // "establecer"
            nuevoStock = ajuste;
        }

        await Image.updateOne({ _id: id }, { cantidad: nuevoStock });
        res.redirect("/mode");
    } catch (err) {
        err.userMessage = "Error al ajustar el stock del producto.";
        next(err);
    }
});

// ---------------------------------------------------------------
// PEDIDOS (Orders)
// ---------------------------------------------------------------

// Public: create a new order from cart (JSON API)
router.post("/pedido", async (req, res, next) => {
    try {
        const { items, total, nombre, telefono, notas } = req.body;
        console.info("[PEDIDO] Intento de creacion de pedido");

        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: "El carrito está vacío." });
        }

        const normalizedItems = [];
        for (const item of items) {
            const productId = item && item.productId ? String(item.productId) : "";
            const precio = parseFloat(item && item.precio);
            const cantidad = parseInt(item && item.cantidad, 10);

            if (!productId || !Types.ObjectId.isValid(productId) || !item.title || !item.codigo || !isFinite(precio) || precio < 0 || !Number.isInteger(cantidad) || cantidad <= 0) {
                return res.status(400).json({ error: "Datos de producto incompletos o inválidos." });
            }

            normalizedItems.push({
                productId,
                title: item.title,
                codigo: item.codigo,
                ciclo: item.ciclo || "",
                precio,
                cantidad,
            });
        }

        const pedido = new Pedido({
            items: normalizedItems,
            total: isFinite(parseFloat(total)) && parseFloat(total) >= 0 ? parseFloat(total) : 0,
            nombre: nombre || "",
            telefono: telefono || "",
            notas: notas || "",
            stockAplicado: false,
        });

        await pedido.save();
        console.info(`[PEDIDO] Pedido creado id=${pedido._id} items=${normalizedItems.length} estado=${pedido.estado}`);
        res.json({ ok: true, id: pedido._id });
    } catch (err) {
        console.error(`[PEDIDO] Error al crear pedido: ${err.message}`);
        err.userMessage = "No se pudo guardar el pedido.";
        next(err);
    }
});

// Admin: list all orders
router.get("/mode/pedidos", async (req, res, next) => {
    try {
        const pedidos = await Pedido.find().sort({ createdAt: -1 });
        const categorias = await Categoria.find({ estado: true });
        res.render("pedidos", { pedidos, categorias });
    } catch (err) {
        err.userMessage = "No se pudieron cargar los pedidos.";
        next(err);
    }
});

// Admin: update order status
router.post("/mode/pedidos/:id/estado", async (req, res, next) => {
    try {
        const { id } = req.params;
        const { estado } = req.body;
        console.info(`[PEDIDO-ESTADO] Cambio solicitado pedido=${id} nuevoEstado=${estado}`);
        const allowed = ["pendiente", "confirmado", "cancelado"];
        if (!allowed.includes(estado)) {
            const err = new Error("Estado inválido.");
            err.userMessage = err.message;
            return next(err);
        }
        const pedido = await Pedido.findById(id);
        if (!pedido) {
            const err = new Error("Pedido no encontrado.");
            err.userMessage = err.message;
            return next(err);
        }
        console.info(`[PEDIDO-ESTADO] Estado actual pedido=${id} estado=${pedido.estado} stockAplicado=${pedido.stockAplicado}`);

        if (pedido.estado === estado) {
            console.info(`[PEDIDO-ESTADO] Sin cambios pedido=${id} estado=${estado}`);
            return res.redirect("/mode/pedidos");
        }

        const wasConfirmed = pedido.estado === "confirmado";
        const willBeConfirmed = estado === "confirmado";
        const willBeCancelled = estado === "cancelado";

        if (!(willBeConfirmed || willBeCancelled)) {
            console.info(`[PEDIDO-ESTADO] Transicion sin movimiento de stock pedido=${id} from=${pedido.estado} to=${estado}`);
        }

        if (willBeConfirmed && !pedido.stockAplicado) {
            console.info(`[PEDIDO-ESTADO] Aplicando descuento de stock pedido=${id}`);
            const discountedItems = [];

            for (const item of pedido.items) {
                const productId = item && item.productId ? String(item.productId) : "";
                const cantidad = parseInt(item && item.cantidad, 10);

                if (!productId || !Types.ObjectId.isValid(productId) || !Number.isInteger(cantidad) || cantidad <= 0) {
                    const err = new Error("El pedido contiene productos inválidos para descontar stock.");
                    err.userMessage = err.message;
                    return next(err);
                }

                const discounted = await Image.updateOne(
                    { _id: productId, cantidad: { $gte: cantidad } },
                    { $inc: { cantidad: -cantidad } }
                );

                if (discounted.modifiedCount === 0) {
                    for (const reverted of discountedItems) {
                        await Image.updateOne({ _id: reverted.productId }, { $inc: { cantidad: reverted.cantidad } });
                    }
                    const err = new Error(`Stock insuficiente para ${item.title || "un producto"}.`);
                    err.userMessage = err.message;
                    return next(err);
                }

                discountedItems.push({ productId, cantidad });
            }

            pedido.stockAplicado = true;
            console.info(`[PEDIDO-ESTADO] Descuento de stock aplicado pedido=${id}`);
        }

        if (willBeCancelled && wasConfirmed && pedido.stockAplicado) {
            console.info(`[PEDIDO-ESTADO] Aplicando reposicion de stock pedido=${id}`);
            const restockedItems = [];

            for (const item of pedido.items) {
                const productId = item && item.productId ? String(item.productId) : "";
                const cantidad = parseInt(item && item.cantidad, 10);

                if (!productId || !Types.ObjectId.isValid(productId) || !Number.isInteger(cantidad) || cantidad <= 0) {
                    const err = new Error("El pedido contiene productos inválidos para reponer stock.");
                    err.userMessage = err.message;
                    return next(err);
                }

                const restocked = await Image.updateOne({ _id: productId }, { $inc: { cantidad: cantidad } });
                if (restocked.modifiedCount === 0) {
                    for (const reverted of restockedItems) {
                        await Image.updateOne({ _id: reverted.productId }, { $inc: { cantidad: -reverted.cantidad } });
                    }
                    const err = new Error(`No se pudo reponer stock para ${item.title || "un producto"}.`);
                    err.userMessage = err.message;
                    return next(err);
                }

                restockedItems.push({ productId, cantidad });
            }

            pedido.stockAplicado = false;
            console.info(`[PEDIDO-ESTADO] Reposicion de stock aplicada pedido=${id}`);
        }

        pedido.estado = estado;
        await pedido.save();
        console.info(`[PEDIDO-ESTADO] Estado actualizado pedido=${id} estado=${estado} stockAplicado=${pedido.stockAplicado}`);
        res.redirect("/mode/pedidos");
    } catch (err) {
        console.error(`[PEDIDO-ESTADO] Error al actualizar estado: ${err.message}`);
        err.userMessage = "No se pudo actualizar el estado del pedido.";
        next(err);
    }
});

module.exports = router;
