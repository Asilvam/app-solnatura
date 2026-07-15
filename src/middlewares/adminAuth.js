const {
    createHmac,
    randomBytes,
    scryptSync,
    timingSafeEqual,
} = require("crypto");

const ADMIN_COOKIE = "solnatura_admin";
const LOGIN_CSRF_COOKIE = "solnatura_login_csrf";
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
const LOGIN_CSRF_MAX_AGE_MS = 10 * 60 * 1000;
const LOGIN_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;
const loginAttempts = new Map();

const safeEqual = (left, right) => {
    const leftBuffer = Buffer.from(String(left || ""));
    const rightBuffer = Buffer.from(String(right || ""));

    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const parseCookies = (header = "") => header.split(";").reduce((cookies, item) => {
    const separator = item.indexOf("=");
    if (separator === -1) return cookies;

    const key = item.slice(0, separator).trim();
    const value = item.slice(separator + 1).trim();

    try {
        cookies[key] = decodeURIComponent(value);
    } catch (err) {
        cookies[key] = value;
    }

    return cookies;
}, {});

const getSessionSecret = () => process.env.ADMIN_SESSION_SECRET || "";

const isAdminConfigured = () => Boolean(
    process.env.ADMIN_USERNAME
    && process.env.ADMIN_PASSWORD_HASH
    && getSessionSecret().length >= 32
);

const sign = (value) => createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url");

const createAdminToken = (username) => {
    const payload = Buffer.from(JSON.stringify({
        username,
        expiresAt: Date.now() + SESSION_MAX_AGE_MS,
        csrf: randomBytes(32).toString("hex"),
    })).toString("base64url");

    return `${payload}.${sign(payload)}`;
};

const readAdminToken = (token) => {
    if (!isAdminConfigured() || typeof token !== "string") return null;

    const [payload, signature, extra] = token.split(".");
    if (!payload || !signature || extra || !safeEqual(signature, sign(payload))) return null;

    try {
        const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        if (!session.username || !session.csrf || session.expiresAt <= Date.now()) return null;
        return session;
    } catch (err) {
        return null;
    }
};

const cookieOptions = (maxAge, path = "/") => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge,
    path,
});

const loadAdminSession = (req, res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    const session = readAdminToken(cookies[ADMIN_COOKIE]);

    if (session) {
        req.admin = { username: session.username };
        req.adminSession = session;
        res.locals.admin = req.admin;
        res.locals.csrfToken = session.csrf;
    } else {
        req.admin = null;
        req.adminSession = null;
        res.locals.admin = null;
        res.locals.csrfToken = "";
    }

    next();
};

const safeAdminPath = (value) => {
    if (typeof value !== "string") return "/mode";

    const isAdminPath = /^\/(?:mode(?:[/?]|$)|modecat(?:[/?]|$)|upload(?:[/?]|$)|update(?:[/?]|$)|image(?:[/?]|$)|categoria(?:[/?]|$))/.test(value);
    return isAdminPath ? value : "/mode";
};

const requireAdmin = (req, res, next) => {
    if (req.admin) return next();

    const destination = req.method === "GET" ? safeAdminPath(req.originalUrl) : "/mode";
    res.redirect(`/admin/login?next=${encodeURIComponent(destination)}`);
};

const requireCsrf = (req, res, next) => {
    if (req.adminSession && safeEqual(req.body._csrf, req.adminSession.csrf)) return next();

    const err = new Error("Invalid CSRF token");
    err.status = 403;
    err.userMessage = "La sesión o el formulario expiró. Recarga la página e intenta nuevamente.";
    next(err);
};

const setAdminSession = (res, username) => {
    res.cookie(ADMIN_COOKIE, createAdminToken(username), cookieOptions(SESSION_MAX_AGE_MS));
};

const clearAdminSession = (res) => {
    res.clearCookie(ADMIN_COOKIE, cookieOptions(0));
};

const issueLoginCsrf = (res) => {
    const token = randomBytes(32).toString("hex");
    res.cookie(LOGIN_CSRF_COOKIE, token, cookieOptions(LOGIN_CSRF_MAX_AGE_MS, "/admin"));
    return token;
};

const verifyLoginCsrf = (req) => {
    const cookies = parseCookies(req.headers.cookie);
    return safeEqual(req.body._csrf, cookies[LOGIN_CSRF_COOKIE]);
};

const clearLoginCsrf = (res) => {
    res.clearCookie(LOGIN_CSRF_COOKIE, cookieOptions(0, "/admin"));
};

const verifyAdminCredentials = (username, password) => {
    if (!isAdminConfigured() || !safeEqual(username, process.env.ADMIN_USERNAME)) return false;
    if (typeof password !== "string") return false;

    const [algorithm, saltHex, hashHex, extra] = process.env.ADMIN_PASSWORD_HASH.split("$");
    if (algorithm !== "scrypt" || !saltHex || !hashHex || extra) return false;

    try {
        const expected = Buffer.from(hashHex, "hex");
        const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
        return expected.length > 0 && timingSafeEqual(actual, expected);
    } catch (err) {
        return false;
    }
};

const getAttemptKey = (req) => req.ip || req.socket.remoteAddress || "unknown";

const getLoginLimit = (req) => {
    const key = getAttemptKey(req);
    const now = Date.now();
    const current = loginAttempts.get(key);

    if (!current || current.resetAt <= now) {
        loginAttempts.delete(key);
        return { allowed: true, retryAfterSeconds: 0 };
    }

    return {
        allowed: current.count < MAX_LOGIN_ATTEMPTS,
        retryAfterSeconds: Math.ceil((current.resetAt - now) / 1000),
    };
};

const registerFailedLogin = (req) => {
    const key = getAttemptKey(req);
    const now = Date.now();
    const current = loginAttempts.get(key);

    if (!current || current.resetAt <= now) {
        loginAttempts.set(key, { count: 1, resetAt: now + LOGIN_ATTEMPT_WINDOW_MS });
    } else {
        current.count += 1;
    }
};

const clearLoginAttempts = (req) => {
    loginAttempts.delete(getAttemptKey(req));
};

module.exports = {
    clearAdminSession,
    clearLoginAttempts,
    clearLoginCsrf,
    getLoginLimit,
    isAdminConfigured,
    issueLoginCsrf,
    loadAdminSession,
    registerFailedLogin,
    requireAdmin,
    requireCsrf,
    safeAdminPath,
    setAdminSession,
    verifyAdminCredentials,
    verifyLoginCsrf,
};
