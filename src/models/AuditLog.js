const { Schema, model } = require("mongoose");

const auditLogSchema = new Schema({
    admin: { type: String, required: true, trim: true },
    action: { type: String, required: true, trim: true, index: true },
    entityType: { type: String, required: true, trim: true, index: true },
    entityId: { type: String, trim: true },
    summary: { type: String, trim: true },
    ip: { type: String, trim: true },
    metadata: { type: Schema.Types.Mixed },
}, {
    timestamps: true,
});

module.exports = model("AuditLog", auditLogSchema);
