const { Router } = require("express");
const {
    clearAdminSession,
    clearLoginAttempts,
    clearLoginCsrf,
    getLoginLimit,
    isAdminConfigured,
    issueLoginCsrf,
    registerFailedLogin,
    requireAdmin,
    requireCsrf,
    safeAdminPath,
    setAdminSession,
    verifyAdminCredentials,
    verifyLoginCsrf,
} = require("../middlewares/adminAuth");
const recordAudit = require("../services/audit");

const router = Router();

const renderLogin = (req, res, options = {}) => {
    const loginCsrf = issueLoginCsrf(res);
    const nextPath = safeAdminPath(options.nextPath || req.query.next || req.body.next);

    res.status(options.status || 200).render("admin-login", {
        configured: isAdminConfigured(),
        error: options.error || "",
        loginCsrf,
        nextPath,
        username: options.username || "",
    });
};

router.get("/admin/login", (req, res) => {
    const nextPath = safeAdminPath(req.query.next);
    if (req.admin) return res.redirect(nextPath);
    renderLogin(req, res, { nextPath });
});

router.post("/admin/login", async (req, res) => {
    const nextPath = safeAdminPath(req.body.next);

    if (!verifyLoginCsrf(req)) {
        return renderLogin(req, res, {
            status: 403,
            error: "El formulario expiró. Intenta iniciar sesión nuevamente.",
            nextPath,
            username: req.body.username,
        });
    }

    if (!isAdminConfigured()) {
        return renderLogin(req, res, {
            status: 503,
            error: "El acceso administrativo todavía no está configurado.",
            nextPath,
            username: req.body.username,
        });
    }

    const limit = getLoginLimit(req);
    if (!limit.allowed) {
        res.set("Retry-After", String(limit.retryAfterSeconds));
        return renderLogin(req, res, {
            status: 429,
            error: `Demasiados intentos. Espera ${Math.ceil(limit.retryAfterSeconds / 60)} minuto(s).`,
            nextPath,
            username: req.body.username,
        });
    }

    if (!verifyAdminCredentials(req.body.username, req.body.password)) {
        registerFailedLogin(req);
        return renderLogin(req, res, {
            status: 401,
            error: "Usuario o contraseña incorrectos.",
            nextPath,
            username: req.body.username,
        });
    }

    clearLoginAttempts(req);
    clearLoginCsrf(res);
    setAdminSession(res, process.env.ADMIN_USERNAME);
    await recordAudit(req, {
        admin: process.env.ADMIN_USERNAME,
        action: "admin.login",
        entityType: "Admin",
        entityId: process.env.ADMIN_USERNAME,
        summary: "Inicio de sesión administrativo",
    });
    res.redirect(nextPath);
});

router.post("/admin/logout", requireAdmin, requireCsrf, async (req, res) => {
    await recordAudit(req, {
        action: "admin.logout",
        entityType: "Admin",
        entityId: req.admin.username,
        summary: "Cierre de sesión administrativo",
    });
    clearAdminSession(res);
    res.redirect("/admin/login");
});

module.exports = router;
