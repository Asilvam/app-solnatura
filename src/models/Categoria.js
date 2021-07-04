const {Schema, model} = require("mongoose");

const categoriaSchema = new Schema(
    {
        nombre: {type: String, required: true, trim: true},
        estado: {type: Boolean, default: true},
        codigo: {type: String, required: true, unique: true, trim: true},
    },
    {
        timestamps: true,
    }
);

module.exports = model("Categoria", categoriaSchema);
