import crypto from "node:crypto";

const SESSION_LIFETIME_SECONDS = 60 * 60 * 24 * 30;
const SESSION_VERSION = 1;

function cookieName() {
  return process.env.VERCEL ? "__Host-cc_session" : "cc_session";
}

function readCookies(req) {
  const header = String(req.headers?.cookie || "");
  return Object.fromEntries(
    header
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator === -1) return [part, ""];
        return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      }),
  );
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sign(payload) {
  return crypto.createHmac("sha256", process.env.DASHBOARD_SESSION_SECRET).update(payload).digest("base64url");
}

export function authConfigured() {
  return Boolean(process.env.DASHBOARD_PASSWORD && process.env.DASHBOARD_SESSION_SECRET);
}

export function verifyPassword(candidate) {
  if (!authConfigured()) return false;
  const expected = crypto.createHash("sha256").update(process.env.DASHBOARD_PASSWORD).digest();
  const received = crypto.createHash("sha256").update(String(candidate || "")).digest();
  return crypto.timingSafeEqual(expected, received);
}

export function createSessionCookie() {
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ version: SESSION_VERSION, issuedAt: now, expiresAt: now + SESSION_LIFETIME_SECONDS }),
  ).toString("base64url");
  const value = `${payload}.${sign(payload)}`;
  const secure = process.env.VERCEL ? "; Secure" : "";
  return `${cookieName()}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_LIFETIME_SECONDS}${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.VERCEL ? "; Secure" : "";
  return `${cookieName()}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function isAuthenticated(req) {
  if (!authConfigured()) return false;
  const value = readCookies(req)[cookieName()];
  if (!value) return false;

  const separator = value.lastIndexOf(".");
  if (separator === -1) return false;
  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!safeEqual(signature, sign(payload))) return false;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1000);
    return session.version === SESSION_VERSION && session.issuedAt <= now && session.expiresAt > now;
  } catch {
    return false;
  }
}

export function requireAuth(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (!authConfigured()) {
    res.status(503).json({ error: "Dashboard sign-in is not configured yet." });
    return false;
  }
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Sign in to continue." });
    return false;
  }
  return true;
}

export function isSameOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin) return true;

  try {
    const forwardedHost = String(req.headers?.["x-forwarded-host"] || "").split(",")[0].trim();
    const expectedHost = forwardedHost || String(req.headers?.host || "").trim();
    return Boolean(expectedHost) && new URL(origin).host === expectedHost;
  } catch {
    return false;
  }
}

export function requireSameOrigin(req, res) {
  if (isSameOrigin(req)) return true;
  res.setHeader("Cache-Control", "private, no-store");
  res.status(403).json({ error: "Request origin is not allowed." });
  return false;
}

export function parseJsonBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string" && req.body.trim()) return JSON.parse(req.body);
  return {};
}
