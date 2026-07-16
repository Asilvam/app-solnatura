const {Schema, model} = require("mongoose");

const categoriaSchema = new Schema(
    {
        nombre: {type: String, required: true, trim: true, maxlength: 100},
        estado: {type: Boolean, default: true},
        codigo: {type: String, required: true, unique: true, trim: true, uppercase: true, maxlength: 100},
    },
    {
        timestamps: true,
    }
);

module.exports = model("Categoria", categoriaSchema);
