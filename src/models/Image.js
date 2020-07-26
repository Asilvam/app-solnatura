const { Schema, model } = require("mongoose");

const imageSchema = new Schema({
  title: { type: String },
  precio: { type: Number },
  cantidad: { type: Number },
  codigo: { type: String },
  ciclo: { type: String },
  description: { type: String },
  filename: { type: String },
  path: { type: String },
  public_id: { type: String },
  originalname: { type: String },
  mimetype: { type: String },
  size: { type: Number },
  created_at: { type: Date, default: Date.now() },
  estado: { type: Boolean, default: true },
  categoria: { type: String },
});

module.exports = model("Image", imageSchema);
