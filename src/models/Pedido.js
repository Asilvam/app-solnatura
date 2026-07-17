const { Schema, model } = require("mongoose");

const orderItemSchema = new Schema({
    productId: {
        type: Schema.Types.ObjectId,
        ref: "Image",
        required: true,
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 120,
    },
    codigo: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        maxlength: 100,
    },
    ciclo: {
        type: String,
        trim: true,
        maxlength: 60,
        default: "",
    },
    precio: {
        type: Number,
        required: true,
        min: 0,
    },
    cantidad: {
        type: Number,
        required: true,
        min: 1,
    },
}, {
    _id: false,
});

const pedidoSchema = new Schema({
    requestId: {
        type: String,
        required: true,
        unique: true,
        immutable: true,
        trim: true,
        maxlength: 100,
    },
    items: {
        type: [orderItemSchema],
        required: true,
        validate: {
            validator: (items) => Array.isArray(items) && items.length > 0,
            message: "El pedido debe contener productos.",
        },
    },
    total: {
        type: Number,
        required: true,
        min: 0,
    },
    canal: {
        type: String,
        enum: ["whatsapp"],
        default: "whatsapp",
    },
    estado: {
        type: String,
        enum: ["pendiente", "confirmado", "cancelado"],
        default: "pendiente",
    },
    estadoActualizadoAt: {
        type: Date,
    },
    estadoActualizadoPor: {
        type: String,
        trim: true,
        maxlength: 120,
    },
    stockProcesado: {
        type: Boolean,
        default: false,
    },
    stockProcesadoAt: {
        type: Date,
    },
    stockProcesadoPor: {
        type: String,
        trim: true,
        maxlength: 120,
    },
}, {
    timestamps: true,
});

module.exports = model("Pedido", pedidoSchema);
