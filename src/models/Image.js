const { Schema, model } = require("mongoose");

const imageSchema = new Schema({
    title: { type: String, required: true, trim: true, maxlength: 120 },
    precio: { type: Number, required: true, min: 0 },
    precioAnterior: { type: Number, default: 0, min: 0 },
    cantidad: { type: Number, required: true, min: 0 },
    codigo: { type: String, required: true, trim: true, uppercase: true, index: true },
    ciclo: { type: String, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 3000 },
    filename: { type: String },
    path: { type: String },
    public_id: { type: String },
    originalname: { type: String },
    mimetype: { type: String },
    size: { type: Number },
    created_at: { type: Date, default: Date.now() },
    estado: { type: Boolean, default: true, index: true },
    categoria: { type: String, required: true, trim: true, uppercase: true, index: true },
});

imageSchema.pre("validate", function enforceInactiveWithoutStock(next) {
    if (Number(this.cantidad) <= 0) {
        this.estado = false;
    }
    next();
});

module.exports = model("Image", imageSchema);
