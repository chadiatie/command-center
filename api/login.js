import {
  authConfigured,
  createSessionCookie,
  parseJsonBody,
  requireSameOrigin,
  verifyPassword,
} from "./_auth.js";

const failedAttempts = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function clientAddress(req) {
  return String(req.headers?.["x-forwarded-for"] || req.socket?.remoteAddress || "unknown").split(",")[0].trim();
}

function attemptsFor(address) {
  const now = Date.now();
  const attempt = failedAttempts.get(address);
  if (!attempt || now - attempt.startedAt > WINDOW_MS) {
    const fresh = { count: 0, startedAt: now };
    failedAttempts.set(address, fresh);
    return fresh;
  }
  return attempt;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  if (!requireSameOrigin(req, res)) return;
  if (!authConfigured()) {
    res.status(503).json({ error: "Dashboard sign-in is not configured yet." });
    return;
  }

  const address = clientAddress(req);
  const attempt = attemptsFor(address);
  if (attempt.count >= MAX_ATTEMPTS) {
    res.status(429).json({ error: "Too many attempts. Try again in a few minutes." });
    return;
  }

  let body;
  try {
    body = parseJsonBody(req);
  } catch {
    res.status(400).json({ error: "Invalid request." });
    return;
  }

  if (typeof body.password !== "string" || body.password.length > 256 || !verifyPassword(body.password)) {
    attempt.count += 1;
    res.status(401).json({ error: "Incorrect password." });
    return;
  }

  failedAttempts.delete(address);
  res.setHeader("Set-Cookie", createSessionCookie());
  res.status(200).json({ ok: true });
}
