const AuditLog = require("../models/AuditLog");

const recordAudit = async (req, entry) => {
    try {
        await AuditLog.create({
            admin: entry.admin || req.admin?.username || "unknown",
            action: entry.action,
            entityType: entry.entityType,
            entityId: entry.entityId ? String(entry.entityId) : undefined,
            summary: entry.summary,
            metadata: entry.metadata,
            ip: req.ip || req.socket.remoteAddress,
        });
    } catch (err) {
        console.error(`[AUDIT] No se pudo registrar ${entry.action}:`, err.message);
    }
};

module.exports = recordAudit;
