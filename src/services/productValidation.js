const normalizeText = (value, maxLength = 255) => String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, maxLength);

const normalizeCode = (value) => normalizeText(value, 60)
    .replace(/\s+/g, "")
    .toUpperCase();

const normalizeCategoryCode = (value) => normalizeText(value, 100).toUpperCase();

const parseNumberField = (value, label, errors, options = {}) => {
    const { integer = false, optional = false } = options;
    const raw = typeof value === "string" ? value.trim().replace(",", ".") : value;

    if ((raw === "" || raw == null) && optional) return 0;
    if (raw === "" || raw == null) {
        errors[options.field] = `${label} es obligatorio.`;
        return 0;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0 || (integer && !Number.isInteger(parsed))) {
        errors[options.field] = integer
            ? `${label} debe ser un número entero igual o mayor que 0.`
            : `${label} debe ser un número igual o mayor que 0.`;
        return 0;
    }

    return parsed;
};

const validateProductInput = (body = {}) => {
    const errors = {};
    const title = normalizeText(body.title, 120);
    const codigo = normalizeCode(body.codigo);
    const categoria = normalizeCategoryCode(body.categoria);
    const ciclo = normalizeText(body.ciclo, 60);
    const description = String(body.description || "").trim().slice(0, 3000);

    if (!title) errors.title = "El nombre es obligatorio.";
    if (!codigo) errors.codigo = "El código es obligatorio.";
    if (!categoria) errors.categoria = "La categoría es obligatoria.";

    const precio = parseNumberField(body.precio, "El precio", errors, { field: "precio" });
    const precioAnterior = parseNumberField(body.precioAnterior, "El precio anterior", errors, {
        field: "precioAnterior",
        optional: true,
    });
    const cantidad = parseNumberField(body.cantidad, "El stock", errors, {
        field: "cantidad",
        integer: true,
    });

    if (!errors.precio && !errors.precioAnterior && precioAnterior > 0 && precioAnterior <= precio) {
        errors.precioAnterior = "Para crear una oferta debe ser mayor que el precio de venta; usa 0 si no hay oferta.";
    }

    return {
        data: {
            title,
            precio,
            precioAnterior,
            cantidad,
            codigo,
            ciclo,
            description,
            categoria,
            estado: cantidad > 0 && (body.estado === "true" || body.estado === "on"),
        },
        errors,
        isValid: Object.keys(errors).length === 0,
    };
};

module.exports = {
    normalizeCategoryCode,
    normalizeCode,
    normalizeText,
    validateProductInput,
};
