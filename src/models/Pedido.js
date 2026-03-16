const { Schema, model } = require("mongoose");

const itemPedidoSchema = new Schema(
    {
        title: { type: String, required: true },
        codigo: { type: String, required: true },
        ciclo: { type: String, default: "" },
        precio: { type: Number, required: true },
        cantidad: { type: Number, required: true, min: 1 },
    },
    { _id: false }
);

const pedidoSchema = new Schema(
    {
        items: { type: [itemPedidoSchema], required: true },
        total: { type: Number, required: true },
        nombre: { type: String, trim: true, default: "" },
        telefono: { type: String, trim: true, default: "" },
        notas: { type: String, trim: true, default: "" },
        estado: {
            type: String,
            enum: ["pendiente", "confirmado", "cancelado"],
            default: "pendiente",
        },
    },
    {
        timestamps: true,
    }
);

module.exports = model("Pedido", pedidoSchema);
