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

const MODE_PAGE_SIZE = 12;
const LOW_STOCK_LIMIT = 5;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const modeSortOptions = {
    recientes: { created_at: -1, _id: -1 },
    antiguos: { created_at: 1, _id: 1 },
    nombre_asc: { title: 1, _id: 1 },
    nombre_desc: { title: -1, _id: -1 },
    precio_asc: { precio: 1, _id: 1 },
    precio_desc: { precio: -1, _id: -1 },
    stock_asc: { cantidad: 1, _id: 1 },
    stock_desc: { cantidad: -1, _id: -1 },
};

const normalizeModeFilters = (query) => {
    const requestedPage = Number.parseInt(query.page, 10);
    const estado = ["vigente", "no-vigente"].includes(query.estado) ? query.estado : "";
    const stock = ["con-stock", "sin-stock", "bajo"].includes(query.stock) ? query.stock : "";
    const oferta = query.oferta === "si" ? "si" : "";
    const orden = Object.prototype.hasOwnProperty.call(modeSortOptions, query.orden)
        ? query.orden
        : "recientes";

    return {
        q: typeof query.q === "string" ? query.q.trim().slice(0, 100) : "",
        estado,
        stock,
        categoria: typeof query.categoria === "string" ? query.categoria.trim().slice(0, 100) : "",
        oferta,
        orden,
        page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    };
};

const buildImageFilter = (filters) => {
    const filter = {};

    if (filters.q) {
        const q = new RegExp(escapeRegex(filters.q), "i");
        filter.$or = [
            { title: q },
            { codigo: q },
            { description: q },
        ];
    }

    if (filters.estado) {
        filter.estado = filters.estado === "vigente";
    }

    if (filters.categoria) {
        filter.categoria = filters.categoria;
    }

    if (filters.stock === "con-stock") {
        filter.cantidad = { $gt: 0 };
    } else if (filters.stock === "sin-stock") {
        filter.cantidad = { $lte: 0 };
    } else if (filters.stock === "bajo") {
        filter.cantidad = { $gt: 0, $lte: LOW_STOCK_LIMIT };
    }

    if (filters.oferta === "si") {
        filter.$expr = {
            $gt: [
                { $ifNull: ["$precioAnterior", 0] },
                { $ifNull: ["$precio", 0] },
            ],
        };
    }

    return filter;
};

const createModeUrlBuilder = (filters) => (overrides = {}) => {
    const values = { ...filters, ...overrides };
    const params = new URLSearchParams();

    ["q", "estado", "stock", "categoria", "oferta"].forEach((key) => {
        if (values[key]) params.set(key, values[key]);
    });

    if (values.orden && values.orden !== "recientes") {
        params.set("orden", values.orden);
    }

    if (Number(values.page) > 1) {
        params.set("page", values.page);
    }

    const query = params.toString();
    return query ? `/mode?${query}` : "/mode";
};

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
        const filters = normalizeModeFilters(req.query);
        const imageFilter = buildImageFilter(filters);

        const [total, categorias, statsResult] = await Promise.all([
            Image.countDocuments(imageFilter),
            Categoria.find({ estado: true }).sort({ nombre: 1 }),
            Image.aggregate([
                {
                    $group: {
                        _id: null,
                        total: { $sum: 1 },
                        vigentes: { $sum: { $cond: [{ $eq: ["$estado", true] }, 1, 0] } },
                        sinStock: {
                            $sum: {
                                $cond: [
                                    { $lte: [{ $ifNull: ["$cantidad", 0] }, 0] },
                                    1,
                                    0,
                                ],
                            },
                        },
                        stockBajo: {
                            $sum: {
                                $cond: [
                                    {
                                        $and: [
                                            { $gt: [{ $ifNull: ["$cantidad", 0] }, 0] },
                                            { $lte: [{ $ifNull: ["$cantidad", 0] }, LOW_STOCK_LIMIT] },
                                        ],
                                    },
                                    1,
                                    0,
                                ],
                            },
                        },
                        ofertas: {
                            $sum: {
                                $cond: [
                                    {
                                        $gt: [
                                            { $ifNull: ["$precioAnterior", 0] },
                                            { $ifNull: ["$precio", 0] },
                                        ],
                                    },
                                    1,
                                    0,
                                ],
                            },
                        },
                    },
                },
            ]),
        ]);

        const totalPages = Math.max(Math.ceil(total / MODE_PAGE_SIZE), 1);
        const page = Math.min(filters.page, totalPages);
        filters.page = page;

        const images = await Image.find(imageFilter)
            .sort(modeSortOptions[filters.orden])
            .skip((page - 1) * MODE_PAGE_SIZE)
            .limit(MODE_PAGE_SIZE);

        const stats = statsResult[0] || {
            total: 0,
            vigentes: 0,
            sinStock: 0,
            stockBajo: 0,
            ofertas: 0,
        };
        const modeUrl = createModeUrlBuilder(filters);

        res.render("index", {
            images,
            categorias,
            filters,
            stats,
            modeUrl,
            currentModeUrl: modeUrl({ page }),
            pagination: {
                page,
                pageSize: MODE_PAGE_SIZE,
                total,
                totalPages,
            },
            lowStockLimit: LOW_STOCK_LIMIT,
        });
    } catch (err) {
        err.userMessage = "No se pudo cargar el panel de administración.";
        next(err);
    }
});

router.get("/mode/cat/:id", async (req, res, next) => {
    try {
        res.redirect(`/mode?categoria=${encodeURIComponent(req.params.id)}`);
    } catch (err) {
        err.userMessage = "No se pudo filtrar por categoría en el panel de administrador.";
        next(err);
    }
});

router.post("/mode/:id/estado", async (req, res, next) => {
    try {
        if (!["true", "false"].includes(req.body.estado)) {
            return res.status(400).send("Estado de producto inválido.");
        }

        await Image.findByIdAndUpdate(req.params.id, {
            estado: req.body.estado === "true",
        });

        const returnTo = typeof req.body.returnTo === "string" && /^\/mode(?:\?|$)/.test(req.body.returnTo)
            ? req.body.returnTo
            : "/mode";
        res.redirect(returnTo);
    } catch (err) {
        err.userMessage = "No se pudo cambiar la vigencia del producto.";
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
        const buscar = typeof req.body.buscar === "string" ? req.body.buscar.trim() : "";
        res.redirect(buscar ? `/mode?q=${encodeURIComponent(buscar)}` : "/mode");
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
