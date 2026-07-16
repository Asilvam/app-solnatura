const { Router } = require("express");
const { unlink } = require("fs-extra");
const { isValidObjectId, startSession } = require("mongoose");
const { requireAdmin, requireCsrf } = require("../middlewares/adminAuth");
const upload = require("../middlewares/upload");
const recordAudit = require("../services/audit");
const buildCatalogWorkbook = require("../services/catalogExport");
const {
    normalizeCategoryCode,
    normalizeCode,
    normalizeText,
    validateProductInput,
} = require("../services/productValidation");
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
const AuditLog = require("../models/AuditLog");

const PUBLIC_PAGE_SIZE = 24;
const MODE_PAGE_SIZE = 12;
const LOW_STOCK_LIMIT = 5;

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const safeModeReturn = (value) => (
    typeof value === "string" && /^\/mode(?:\?|$)/.test(value) ? value : "/mode"
);

const requestWantsJson = (req) => (
    String(req.get("accept") || "").includes("application/json")
);

const redirectWithNotice = (res, destination, notice) => {
    const separator = destination.includes("?") ? "&" : "?";
    res.redirect(`${destination}${separator}notice=${encodeURIComponent(notice)}`);
};

const cleanupTempFile = async (file) => {
    if (!file || !file.path) return;

    try {
        await unlink(file.path);
    } catch (err) {
        if (err.code !== "ENOENT") console.error("No se pudo limpiar el archivo temporal:", err.message);
    }
};

const findCodeConflict = (codigo, excludedId) => {
    const filter = {
        codigo: new RegExp(`^${escapeRegex(codigo)}$`, "i"),
    };
    if (excludedId) filter._id = { $ne: excludedId };
    return Image.findOne(filter).select("_id codigo").lean();
};

const validateProductReferences = async (validation, excludedId) => {
    if (validation.data.codigo) {
        const conflict = await findCodeConflict(validation.data.codigo, excludedId);
        if (conflict) validation.errors.codigo = "Ya existe un producto con este código.";
    }

    if (validation.data.categoria) {
        const categoryExists = await Categoria.exists({
            codigo: validation.data.categoria,
            estado: true,
        });
        if (!categoryExists) validation.errors.categoria = "Selecciona una categoría vigente.";
    }

    validation.isValid = Object.keys(validation.errors).length === 0;
    return validation;
};

const productFormValues = (source = {}) => ({
    title: source.title || "",
    precio: source.precio ?? "",
    precioAnterior: source.precioAnterior ?? 0,
    cantidad: source.cantidad ?? "",
    codigo: normalizeCode(source.codigo),
    ciclo: source.ciclo || "",
    description: source.description || "",
    categoria: normalizeCategoryCode(source.categoria),
    estado: source.estado === true || source.estado === "true" || source.estado === "on",
});

const normalizeNewCategoryCode = (value) => normalizeCategoryCode(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);

const categoryFormValues = (source = {}) => ({
    nombre: normalizeText(source.nombre, 100),
    codigo: normalizeNewCategoryCode(source.codigo),
});

const loadCategoryAdminData = async () => {
    const [categorias, productCountsResult] = await Promise.all([
        Categoria.find().sort({ nombre: 1 }),
        Image.aggregate([
            {
                $group: {
                    _id: { $toUpper: { $ifNull: ["$categoria", ""] } },
                    total: { $sum: 1 },
                },
            },
        ]),
    ]);
    const productCounts = Object.fromEntries(
        productCountsResult.map((item) => [String(item._id || ""), item.total])
    );

    return { categorias, productCounts };
};

const parseProductImage = (view) => (req, res, next) => {
    upload.single("image")(req, res, (uploadError) => {
        if (!uploadError) return next();

        requireCsrf(req, res, async (csrfError) => {
            if (csrfError) return next(csrfError);

            try {
                const categorias = await Categoria.find({ estado: true }).sort({ nombre: 1 });
                const errors = {
                    image: uploadError.userMessage
                        || (uploadError.code === "LIMIT_FILE_SIZE"
                            ? "La imagen supera el límite de 10MB."
                            : "No se pudo procesar la imagen."),
                };

                if (view === "update") {
                    const image = isValidObjectId(req.params.id)
                        ? await Image.findById(req.params.id)
                        : null;
                    if (!image) return res.status(404).send("Producto no encontrado.");

                    return res.status(422).render("update", {
                        image,
                        categorias,
                        values: productFormValues(req.body),
                        errors,
                    });
                }

                return res.status(422).render("upload", {
                    categorias,
                    values: productFormValues(req.body),
                    errors,
                    notice: "",
                });
            } catch (err) {
                next(err);
            }
        });
    });
};

const publicSortOptions = {
    recientes: { created_at: -1, _id: -1 },
    nombre_asc: { title: 1, _id: 1 },
    nombre_desc: { title: -1, _id: -1 },
    precio_asc: { precio: 1, _id: 1 },
    precio_desc: { precio: -1, _id: -1 },
};

const normalizePublicPrice = (value) => {
    if (typeof value !== "string" && typeof value !== "number") return "";

    const normalized = String(value).trim().replace(",", ".");
    if (!normalized) return "";

    const price = Number(normalized);
    return Number.isFinite(price) && price >= 0 ? price : "";
};

const normalizePublicFilters = (query) => {
    const requestedPage = Number.parseInt(query.page, 10);
    const orden = Object.prototype.hasOwnProperty.call(publicSortOptions, query.orden)
        ? query.orden
        : "recientes";
    let precioMin = normalizePublicPrice(query.precioMin);
    let precioMax = normalizePublicPrice(query.precioMax);

    if (precioMin !== "" && precioMax !== "" && precioMin > precioMax) {
        [precioMin, precioMax] = [precioMax, precioMin];
    }

    return {
        q: typeof query.q === "string" ? query.q.trim().slice(0, 100) : "",
        categoria: typeof query.categoria === "string"
            ? query.categoria.trim().slice(0, 100)
            : "",
        oferta: query.oferta === "si" ? "si" : "",
        precioMin,
        precioMax,
        orden,
        page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
    };
};

const buildPublicImageFilter = (filters, activeCategoryCodes) => {
    const filter = {
        estado: true,
        cantidad: { $gt: 0 },
        categoria: filters.categoria || { $in: activeCategoryCodes },
    };

    if (filters.q) {
        const q = new RegExp(escapeRegex(filters.q), "i");
        filter.$or = [
            { title: q },
            { codigo: q },
            { description: q },
        ];
    }

    if (filters.precioMin !== "" || filters.precioMax !== "") {
        filter.precio = {};
        if (filters.precioMin !== "") filter.precio.$gte = filters.precioMin;
        if (filters.precioMax !== "") filter.precio.$lte = filters.precioMax;
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

const createPublicUrlBuilder = (filters) => (overrides = {}) => {
    const values = { ...filters, ...overrides };
    const params = new URLSearchParams();

    ["q", "categoria", "oferta"].forEach((key) => {
        if (values[key]) params.set(key, values[key]);
    });

    if (values.precioMin !== "") params.set("precioMin", values.precioMin);
    if (values.precioMax !== "") params.set("precioMax", values.precioMax);
    if (values.orden && values.orden !== "recientes") params.set("orden", values.orden);
    if (Number(values.page) > 1) params.set("page", values.page);

    const query = params.toString();
    return query ? `/?${query}` : "/";
};

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
        const filters = normalizePublicFilters(req.query);
        const categorias = await Categoria.find({ estado: true }).sort({ nombre: 1 });
        const activeCategoryCodes = categorias.map((categoria) => categoria.codigo);

        if (filters.categoria && !activeCategoryCodes.includes(filters.categoria)) {
            filters.categoria = "";
        }

        const imageFilter = buildPublicImageFilter(filters, activeCategoryCodes);
        const total = await Image.countDocuments(imageFilter);
        const totalPages = Math.max(Math.ceil(total / PUBLIC_PAGE_SIZE), 1);
        const page = Math.min(filters.page, totalPages);
        filters.page = page;
        const publicUrl = createPublicUrlBuilder(filters);
        const canonicalUrl = publicUrl();

        if (req.originalUrl !== canonicalUrl) {
            return res.redirect(canonicalUrl);
        }

        const images = await Image.find(imageFilter)
            .sort(publicSortOptions[filters.orden])
            .skip((page - 1) * PUBLIC_PAGE_SIZE)
            .limit(PUBLIC_PAGE_SIZE);

        res.render("index2", {
            images,
            categorias,
            filters,
            publicUrl,
            currentPublicUrl: publicUrl({ page }),
            pagination: {
                page,
                pageSize: PUBLIC_PAGE_SIZE,
                total,
                totalPages,
            },
        });
    } catch (err) {
        err.userMessage = "No se pudo cargar el catálogo de imágenes.";
        next(err);
    }
});

router.get("/cat/:id", async (req, res, next) => {
    try {
        const filters = normalizePublicFilters({
            ...req.query,
            categoria: req.params.id,
            page: 1,
        });
        res.redirect(createPublicUrlBuilder(filters)());
    } catch (err) {
        err.userMessage = "No se pudo cargar la categoría solicitada. Verifica que el ID sea válido.";
        next(err);
    }
});

router.get("/modecat", requireAdmin, async (req, res, next) => {
    try {
        const categoryData = await loadCategoryAdminData();
        res.render("cat", {
            ...categoryData,
            values: categoryFormValues(),
            errors: {},
            notice: typeof req.query.notice === "string" ? req.query.notice.slice(0, 180) : "",
        });
    } catch (err) {
        err.userMessage = "No se pudo cargar el panel de categorías.";
        next(err);
    }
});

router.post("/modecat", requireAdmin, requireCsrf, async (req, res, next) => {
    try {
        const values = categoryFormValues(req.body);
        const errors = {};

        if (!values.nombre) errors.nombre = "Escribe un nombre para la categoría.";
        if (!values.codigo) errors.codigo = "Escribe o genera un código para la categoría.";

        if (values.nombre || values.codigo) {
            const conflicts = await Categoria.findOne({
                $or: [
                    { codigo: values.codigo },
                    { nombre: new RegExp(`^${escapeRegex(values.nombre)}$`, "i") },
                ],
            }).select("codigo nombre").lean();

            if (conflicts) {
                if (conflicts.codigo === values.codigo) {
                    errors.codigo = "Ya existe una categoría con este código.";
                }
                if (conflicts.nombre.toLowerCase() === values.nombre.toLowerCase()) {
                    errors.nombre = "Ya existe una categoría con este nombre.";
                }
            }
        }

        if (Object.keys(errors).length > 0) {
            const categoryData = await loadCategoryAdminData();
            return res.status(422).render("cat", {
                ...categoryData,
                values,
                errors,
                notice: "",
            });
        }

        const categoria = new Categoria(values);
        await categoria.save();
        await recordAudit(req, {
            action: "category.create",
            entityType: "Categoria",
            entityId: categoria._id,
            summary: `Categoría creada: ${categoria.nombre}`,
            metadata: { codigo: categoria.codigo },
        });
        redirectWithNotice(res, "/modecat", `Categoría creada: ${categoria.nombre}.`);
    } catch (err) {
        if (err.code === 11000) {
            const categoryData = await loadCategoryAdminData();
            return res.status(422).render("cat", {
                ...categoryData,
                values: categoryFormValues(req.body),
                errors: { codigo: "Ya existe una categoría con este código." },
                notice: "",
            });
        }
        err.userMessage = "Error al crear la categoría. Verifica que el código y nombre sean correctos.";
        next(err);
    }
});

router.post("/categoria/:id/update", requireAdmin, requireCsrf, async (req, res, next) => {
    const { id } = req.params;

    try {
        if (!isValidObjectId(id)) {
            return redirectWithNotice(res, "/modecat", "Categoría inválida.");
        }

        const values = categoryFormValues(req.body);
        const requestedState = req.body.estado === "true" || req.body.estado === "on";
        if (!values.nombre || !values.codigo) {
            return redirectWithNotice(
                res,
                "/modecat",
                "El nombre y el código de la categoría son obligatorios."
            );
        }

        const conflict = await Categoria.findOne({
            _id: { $ne: id },
            $or: [
                { codigo: values.codigo },
                { nombre: new RegExp(`^${escapeRegex(values.nombre)}$`, "i") },
            ],
        }).select("codigo nombre").lean();

        if (conflict) {
            const duplicatedField = conflict.codigo === values.codigo ? "código" : "nombre";
            return redirectWithNotice(
                res,
                "/modecat",
                `No se pudo editar: ya existe una categoría con ese ${duplicatedField}.`
            );
        }

        const session = await startSession();
        let updatedCategory;
        let previousCode;
        let previousState;
        let migratedProducts = 0;

        try {
            await session.withTransaction(async () => {
                const categoria = await Categoria.findById(id).session(session);
                if (!categoria) {
                    const notFoundError = new Error("Categoría no encontrada.");
                    notFoundError.status = 404;
                    throw notFoundError;
                }

                previousCode = categoria.codigo;
                previousState = categoria.estado;
                categoria.nombre = values.nombre;
                categoria.codigo = values.codigo;
                categoria.estado = requestedState;
                await categoria.save({ session });

                if (previousCode !== values.codigo) {
                    const migration = await Image.updateMany(
                        { categoria: new RegExp(`^${escapeRegex(previousCode)}$`, "i") },
                        { $set: { categoria: values.codigo } },
                        { session, runValidators: true }
                    );
                    migratedProducts = migration.modifiedCount || 0;
                }

                updatedCategory = categoria;
            });
        } finally {
            await session.endSession();
        }

        await recordAudit(req, {
            action: "category.update",
            entityType: "Categoria",
            entityId: updatedCategory._id,
            summary: `Categoría editada: ${updatedCategory.nombre}`,
            metadata: {
                codigoAnterior: previousCode,
                codigoNuevo: updatedCategory.codigo,
                estadoAnterior: previousState,
                estadoNuevo: updatedCategory.estado,
                productosMigrados: migratedProducts,
            },
        });

        const migrationNotice = migratedProducts > 0
            ? ` Se actualizaron ${migratedProducts} producto${migratedProducts === 1 ? "" : "s"} asociado${migratedProducts === 1 ? "" : "s"}.`
            : "";
        redirectWithNotice(
            res,
            "/modecat",
            `Categoría actualizada: ${updatedCategory.nombre} (${updatedCategory.estado ? "vigente" : "no vigente"}).${migrationNotice}`
        );
    } catch (err) {
        if (err.status === 404) {
            return redirectWithNotice(res, "/modecat", "La categoría que intentas editar ya no existe.");
        }
        if (err.code === 11000) {
            return redirectWithNotice(res, "/modecat", "Ya existe una categoría con ese código.");
        }
        err.userMessage = "No se pudo editar la categoría ni actualizar sus productos asociados.";
        next(err);
    }
});

router.get("/mode/auditoria", requireAdmin, async (req, res, next) => {
    try {
        const [logs, categorias] = await Promise.all([
            AuditLog.find().sort({ createdAt: -1 }).limit(100).lean(),
            Categoria.find({ estado: true }).sort({ nombre: 1 }),
        ]);
        res.render("audit", { logs, categorias });
    } catch (err) {
        err.userMessage = "No se pudo cargar el historial administrativo.";
        next(err);
    }
});

router.get("/mode/export.xlsx", requireAdmin, async (req, res, next) => {
    try {
        const filters = normalizeModeFilters(req.query);
        const [products, categories] = await Promise.all([
            Image.find(buildImageFilter(filters)).sort(modeSortOptions[filters.orden]).lean(),
            Categoria.find().select("codigo nombre").lean(),
        ]);
        const categoryNames = Object.fromEntries(
            categories.map((category) => [category.codigo, category.nombre])
        );
        const workbook = buildCatalogWorkbook(products, categoryNames);
        const buffer = await workbook.xlsx.writeBuffer();

        res.setHeader(
            "Content-Type",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        );
        res.setHeader("Content-Disposition", 'attachment; filename="catalogo-solnatura.xlsx"');
        res.send(Buffer.from(buffer));
    } catch (err) {
        err.userMessage = "No se pudo exportar el catálogo.";
        next(err);
    }
});

router.get("/mode", requireAdmin, async (req, res, next) => {
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
        const exportUrl = modeUrl({ page: 1 }).replace(/^\/mode/, "/mode/export.xlsx");
        const categoryNames = Object.fromEntries(
            categorias.map((category) => [category.codigo, category.nombre])
        );

        res.render("index", {
            images,
            categorias,
            categoryNames,
            filters,
            stats,
            modeUrl,
            exportUrl,
            currentModeUrl: modeUrl({ page }),
            notice: typeof req.query.notice === "string" ? req.query.notice.slice(0, 180) : "",
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

router.get("/mode/cat/:id", requireAdmin, async (req, res, next) => {
    try {
        res.redirect(`/mode?categoria=${encodeURIComponent(req.params.id)}`);
    } catch (err) {
        err.userMessage = "No se pudo filtrar por categoría en el panel de administrador.";
        next(err);
    }
});

router.post("/mode/bulk", requireAdmin, requireCsrf, async (req, res, next) => {
    const returnTo = safeModeReturn(req.body.returnTo);

    try {
        const requestedIds = Array.isArray(req.body.productIds)
            ? req.body.productIds
            : [req.body.productIds].filter(Boolean);
        const productIds = [...new Set(requestedIds.filter(isValidObjectId))];
        const action = req.body.bulkAction;

        if (productIds.length === 0) {
            return redirectWithNotice(res, returnTo, "Selecciona al menos un producto.");
        }

        let update;
        let summary;
        let metadata = { productIds };

        if (action === "activar" || action === "desactivar") {
            const estado = action === "activar";
            update = { estado };
            summary = `${productIds.length} productos marcados como ${estado ? "vigentes" : "no vigentes"}`;
            metadata = { ...metadata, estado };
        } else if (action === "categoria") {
            const categoria = normalizeCategoryCode(req.body.bulkCategory);
            const categoryExists = await Categoria.exists({ codigo: categoria, estado: true });
            if (!categoryExists) {
                return redirectWithNotice(res, returnTo, "Selecciona una categoría vigente para continuar.");
            }
            update = { categoria };
            summary = `${productIds.length} productos movidos a la categoría ${categoria}`;
            metadata = { ...metadata, categoria };
        } else {
            return redirectWithNotice(res, returnTo, "Selecciona una acción masiva válida.");
        }

        const result = await Image.updateMany({ _id: { $in: productIds } }, update, { runValidators: true });
        await recordAudit(req, {
            action: "product.bulk-update",
            entityType: "Image",
            summary,
            metadata: { ...metadata, modifiedCount: result.modifiedCount },
        });

        redirectWithNotice(res, returnTo, `${result.modifiedCount} productos actualizados.`);
    } catch (err) {
        err.userMessage = "No se pudo completar la acción masiva.";
        next(err);
    }
});

router.post("/mode/:id/stock", requireAdmin, requireCsrf, async (req, res, next) => {
    const returnTo = safeModeReturn(req.body.returnTo);
    const wantsJson = requestWantsJson(req);

    try {
        const delta = Number(req.body.delta);
        if (!isValidObjectId(req.params.id) || ![-1, 1].includes(delta)) {
            if (wantsJson) {
                return res.status(400).json({ ok: false, message: "Ajuste de stock inválido." });
            }
            return redirectWithNotice(res, returnTo, "Ajuste de stock inválido.");
        }

        const stockFilter = delta < 0
            ? { _id: req.params.id, cantidad: { $gt: 0 } }
            : { _id: req.params.id };
        const product = await Image.findOneAndUpdate(stockFilter, [
            {
                $set: {
                    cantidad: { $add: [{ $ifNull: ["$cantidad", 0] }, delta] },
                },
            },
            {
                $set: {
                    estado: { $gt: ["$cantidad", 0] },
                },
            },
        ], { new: true });
        if (!product) {
            const exists = await Image.exists({ _id: req.params.id });
            const message = exists ? "El stock ya está en 0." : "Producto no encontrado.";
            if (wantsJson) {
                return res.status(exists ? 409 : 404).json({ ok: false, message });
            }
            return redirectWithNotice(res, returnTo, message);
        }
        const previousStock = product.cantidad - delta;

        await recordAudit(req, {
            action: "product.stock-adjust",
            entityType: "Image",
            entityId: product._id,
            summary: `Stock ajustado: ${product.title} (${delta > 0 ? "+1" : "-1"})`,
            metadata: {
                previousStock,
                currentStock: product.cantidad,
                currentEstado: product.estado,
                delta,
            },
        });

        const message = `Stock actualizado a ${product.cantidad}.`;
        if (wantsJson) {
            return res.json({
                ok: true,
                stock: product.cantidad,
                estado: product.estado,
                message,
            });
        }
        redirectWithNotice(res, returnTo, message);
    } catch (err) {
        err.userMessage = "No se pudo ajustar el stock.";
        if (wantsJson) {
            console.error("No se pudo ajustar el stock:", err);
            return res.status(500).json({ ok: false, message: err.userMessage });
        }
        next(err);
    }
});

router.post("/mode/:id/estado", requireAdmin, requireCsrf, async (req, res, next) => {
    const returnTo = safeModeReturn(req.body.returnTo);
    const wantsJson = requestWantsJson(req);

    try {
        if (!isValidObjectId(req.params.id) || !["true", "false"].includes(req.body.estado)) {
            const message = "Estado de producto inválido.";
            if (wantsJson) return res.status(400).json({ ok: false, message });
            return redirectWithNotice(res, returnTo, message);
        }

        const requestedState = req.body.estado === "true";
        const filter = requestedState
            ? { _id: req.params.id, cantidad: { $gt: 0 } }
            : { _id: req.params.id };
        const image = await Image.findOneAndUpdate(filter, {
            estado: requestedState,
        }, { new: true, runValidators: true });

        if (!image) {
            const existingProduct = await Image.findById(req.params.id).select("cantidad").lean();
            const message = existingProduct
                ? "Agrega al menos una unidad de stock para activar el producto."
                : "Producto no encontrado.";
            const status = existingProduct ? 409 : 404;
            if (wantsJson) return res.status(status).json({ ok: false, message });
            return redirectWithNotice(res, returnTo, message);
        }

        await recordAudit(req, {
            action: "product.status",
            entityType: "Image",
            entityId: image._id,
            summary: `${image.title}: ${image.estado ? "vigente" : "no vigente"}`,
            metadata: { estado: image.estado },
        });

        const message = image.estado
            ? "Producto marcado como vigente."
            : "Producto marcado como no vigente.";
        if (wantsJson) {
            return res.json({ ok: true, estado: image.estado, message });
        }
        redirectWithNotice(res, returnTo, message);
    } catch (err) {
        err.userMessage = "No se pudo cambiar la vigencia del producto.";
        if (wantsJson) {
            console.error("No se pudo cambiar la vigencia:", err);
            return res.status(500).json({ ok: false, message: err.userMessage });
        }
        next(err);
    }
});

router.get("/update/:id", requireAdmin, async (req, res, next) => {
    try {
        const image = await Image.findById(req.params.id);
        if (!image) return res.status(404).send("Producto no encontrado.");
        const categorias = await Categoria.find({ estado: true });
        res.render("update", {
            image,
            categorias,
            values: productFormValues(image),
            errors: {},
        });
    } catch (err) {
        err.userMessage = "No se encontró la imagen a editar. Puede que haya sido eliminada.";
        next(err);
    }
});

router.post("/update/:id", requireAdmin, parseProductImage("update"), requireCsrf, async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) return res.status(404).send("Producto no encontrado.");

        const image = await Image.findById(id);
        if (!image) return res.status(404).send("Producto no encontrado.");

        const validation = await validateProductReferences(validateProductInput(req.body), id);
        if (!validation.isValid) {
            const categorias = await Categoria.find({ estado: true }).sort({ nombre: 1 });
            return res.status(422).render("update", {
                image,
                categorias,
                values: productFormValues(req.body),
                errors: validation.errors,
            });
        }

        const previousPublicId = image.public_id;
        Object.assign(image, validation.data);

        if (req.file) {
            const result = await cloudinary.v2.uploader.upload(req.file.path);
            image.path = result.secure_url;
            image.public_id = result.public_id;
            image.filename = req.file.filename;
            image.originalname = req.file.originalname;
            image.mimetype = req.file.mimetype;
            image.size = req.file.size;
        }

        await image.save();

        if (req.file && previousPublicId && previousPublicId !== image.public_id) {
            try {
                await cloudinary.v2.uploader.destroy(previousPublicId);
            } catch (cloudinaryError) {
                console.error("No se pudo eliminar la imagen anterior de Cloudinary:", cloudinaryError.message);
            }
        }

        await recordAudit(req, {
            action: "product.update",
            entityType: "Image",
            entityId: image._id,
            summary: `Producto actualizado: ${image.title}`,
            metadata: {
                codigo: image.codigo,
                estado: image.estado,
            },
        });
        res.redirect("/mode");
    } catch (err) {
        err.userMessage = "Error al actualizar la imagen. Verifica los datos e intenta nuevamente.";
        next(err);
    } finally {
        await cleanupTempFile(req.file);
    }
});

router.get("/upload", requireAdmin, async (req, res, next) => {
    try {
        const categorias = await Categoria.find({ estado: true });
        res.render("upload", {
            categorias,
            values: productFormValues({ estado: true }),
            errors: {},
            notice: typeof req.query.notice === "string" ? req.query.notice.slice(0, 180) : "",
        });
    } catch (err) {
        err.userMessage = "No se pudo cargar el formulario de subida.";
        next(err);
    }
});

router.post("/upload", requireAdmin, parseProductImage("upload"), requireCsrf, async (req, res, next) => {
    try {
        const validation = await validateProductReferences(validateProductInput({
            ...req.body,
            estado: "true",
        }));
        if (!req.file) validation.errors.image = "Selecciona una imagen JPG, PNG o WebP.";
        validation.isValid = Object.keys(validation.errors).length === 0;

        if (!validation.isValid) {
            const categorias = await Categoria.find({ estado: true }).sort({ nombre: 1 });
            return res.status(422).render("upload", {
                categorias,
                values: productFormValues(req.body),
                errors: validation.errors,
                notice: "",
            });
        }

        const result = await cloudinary.v2.uploader.upload(req.file.path);
        const image = new Image({
            ...validation.data,
            filename: req.file.filename,
            path: result.secure_url,
            public_id: result.public_id,
            originalname: req.file.originalname,
            mimetype: req.file.mimetype,
            size: req.file.size,
        });
        await image.save();
        await recordAudit(req, {
            action: "product.create",
            entityType: "Image",
            entityId: image._id,
            summary: `Producto creado: ${image.title}`,
            metadata: { codigo: image.codigo },
        });
        redirectWithNotice(res, "/upload", `Producto creado: ${image.title}.`);
    } catch (err) {
        err.userMessage = "Error al subir la imagen. Verifica el archivo y tu conexión a Cloudinary.";
        next(err);
    } finally {
        await cleanupTempFile(req.file);
    }
});

//Buscar publico
router.get("/search_pub", (req, res, next) => {
    try {
        const filters = normalizePublicFilters({
            ...req.query,
            q: req.query.buscar || req.query.q,
            page: 1,
        });
        res.redirect(createPublicUrlBuilder(filters)());
    } catch (err) {
        err.userMessage = "Error al realizar la búsqueda pública. Intenta con otros términos.";
        next(err);
    }
});

router.post("/search_pub", (req, res, next) => {
    try {
        const filters = normalizePublicFilters({
            q: req.body.buscar,
            page: 1,
        });
        res.redirect(303, createPublicUrlBuilder(filters)());
    } catch (err) {
        err.userMessage = "Error al realizar la búsqueda pública. Intenta con otros términos.";
        next(err);
    }
});

router.post("/image/:id/delete", requireAdmin, requireCsrf, async (req, res, next) => {
    try {
        const { id } = req.params;
        const imageDeleted = await Image.findByIdAndDelete(id);
        if (!imageDeleted) return res.status(404).send("Producto no encontrado.");

        const result = await cloudinary.v2.uploader.destroy(imageDeleted.public_id, { invalidate: true });
        if (result.result !== 'ok') {
            console.error("Failed to delete image from Cloudinary");
        }
        await recordAudit(req, {
            action: "product.delete",
            entityType: "Image",
            entityId: imageDeleted._id,
            summary: `Producto eliminado: ${imageDeleted.title}`,
            metadata: { codigo: imageDeleted.codigo },
        });
        redirectWithNotice(
            res,
            safeModeReturn(req.body.returnTo),
            `Producto eliminado: ${imageDeleted.title}.`
        );
    } catch (err) {
        err.userMessage = "No se pudo eliminar la imagen. Puede que ya haya sido borrada o no exista en Cloudinary.";
        next(err);
    }
});

router.post("/categoria/:id/delete", requireAdmin, requireCsrf, async (req, res, next) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) {
            return redirectWithNotice(res, "/modecat", "Categoría inválida.");
        }

        const categoria = await Categoria.findById(id);
        if (!categoria) return res.status(404).send("Categoría no encontrada.");

        const assignedProducts = await Image.countDocuments({
            categoria: new RegExp(`^${escapeRegex(categoria.codigo)}$`, "i"),
        });
        if (assignedProducts > 0) {
            return redirectWithNotice(
                res,
                "/modecat",
                `No se puede borrar ${categoria.nombre}: tiene ${assignedProducts} producto${assignedProducts === 1 ? "" : "s"} asignado${assignedProducts === 1 ? "" : "s"}.`
            );
        }

        await categoria.deleteOne();

        await recordAudit(req, {
            action: "category.delete",
            entityType: "Categoria",
            entityId: categoria._id,
            summary: `Categoría eliminada: ${categoria.nombre}`,
            metadata: { codigo: categoria.codigo },
        });
        redirectWithNotice(res, "/modecat", `Categoría eliminada: ${categoria.nombre}.`);
    } catch (err) {
        err.userMessage = "No se pudo eliminar la categoría. Puede que ya no exista.";
        next(err);
    }
});

module.exports = router;
