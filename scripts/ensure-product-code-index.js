require("dotenv").config();
const mongoose = require("mongoose");
const Image = require("../src/models/Image");
const { normalizeCode } = require("../src/services/productValidation");

const run = async () => {
    if (!process.env.MONGODB_URI) {
        throw new Error("MONGODB_URI no está configurada.");
    }

    await mongoose.connect(process.env.MONGODB_URI);

    const products = await Image.find().select("_id codigo").lean();
    const codes = new Map();
    const invalidProducts = [];

    products.forEach((product) => {
        const normalized = normalizeCode(product.codigo);
        if (!normalized) {
            invalidProducts.push(`${product._id}: código vacío`);
            return;
        }

        const matches = codes.get(normalized) || [];
        matches.push(product);
        codes.set(normalized, matches);
    });

    codes.forEach((matches, code) => {
        if (matches.length > 1) {
            invalidProducts.push(`${code}: ${matches.map((product) => product._id).join(", ")}`);
        }
    });

    if (invalidProducts.length > 0) {
        console.error("No se creó el índice. Corrige estos productos primero:");
        invalidProducts.forEach((item) => console.error(`- ${item}`));
        process.exitCode = 1;
        return;
    }

    const operations = products
        .map((product) => ({ product, codigo: normalizeCode(product.codigo) }))
        .filter(({ product, codigo }) => product.codigo !== codigo)
        .map(({ product, codigo }) => ({
            updateOne: {
                filter: { _id: product._id },
                update: { $set: { codigo } },
            },
        }));

    if (operations.length > 0) {
        await Image.bulkWrite(operations, { ordered: true });
    }

    await Image.collection.createIndex(
        { codigo: 1 },
        { unique: true, name: "codigo_unique" }
    );

    console.log(`Índice único listo. ${operations.length} códigos normalizados.`);
};

run()
    .catch((err) => {
        console.error("No se pudo preparar el índice único:", err.message);
        process.exitCode = 1;
    })
    .finally(async () => {
        await mongoose.disconnect();
    });
