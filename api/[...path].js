import { neon } from "@neondatabase/serverless";
import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt);
const COOKIE = "portfolio_admin_session";
const DAY = 7 * 24 * 60 * 60 * 1000;
let schemaReady;

function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured in Vercel.");
  return neon(process.env.DATABASE_URL);
}
async function setup(sql) {
  if (!schemaReady) schemaReady = (async () => {
    await sql.query("CREATE TABLE IF NOT EXISTS portfolio_admin (id integer PRIMARY KEY, username text NOT NULL, password_hash text NOT NULL, password_salt text NOT NULL)");
    await sql.query("CREATE TABLE IF NOT EXISTS portfolio_sessions (token_hash text PRIMARY KEY, expires_at bigint NOT NULL)");
    await sql.query("CREATE TABLE IF NOT EXISTS portfolio_data (id integer PRIMARY KEY, content jsonb NOT NULL)");
    const rows = await sql.query("SELECT id FROM portfolio_admin WHERE id = 1");
    if (!rows.length && process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD) {
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = (await scrypt(process.env.ADMIN_PASSWORD, salt, 64)).toString("hex");
      await sql.query("INSERT INTO portfolio_admin (id, username, password_hash, password_salt) VALUES (1, $1, $2, $3) ON CONFLICT (id) DO NOTHING", [process.env.ADMIN_USERNAME, hash, salt]);
    }
  })().catch(err => { schemaReady = undefined; throw err; });
  await schemaReady;
}
function send(res, status, body, extra = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  for (const [k, v] of Object.entries(extra)) res.setHeader(k, v);
  res.end(JSON.stringify(body));
}
function cookieValue(req) {
  const raw = req.headers.cookie || "";
  const item = raw.split(";").map(x => x.trim()).find(x => x.startsWith(COOKIE + "="));
  return item ? decodeURIComponent(item.slice(COOKIE.length + 1)) : "";
}
function cookieHeader(value, maxAge) {
  return COOKIE + "=" + encodeURIComponent(value) + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge;
}
async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  let raw = "";
  for await (const chunk of req) raw += chunk;
  try { return JSON.parse(raw || "{}"); } catch { throw new Error("Invalid JSON body."); }
}
function hashToken(token) { return crypto.createHash("sha256").update(token).digest("hex"); }
async function currentAdmin(sql, req) {
  const token = cookieValue(req);
  if (!token) return null;
  const rows = await sql.query("SELECT a.id, a.username FROM portfolio_sessions s JOIN portfolio_admin a ON a.id = 1 WHERE s.token_hash = $1 AND s.expires_at > $2", [hashToken(token), Date.now()]);
  return rows[0] || null;
}
async function checkPassword(password, row) {
  const hash = (await scrypt(String(password || ""), row.password_salt, 64)).toString("hex");
  const a = Buffer.from(hash, "hex"); const b = Buffer.from(row.password_hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
export default async function handler(req, res) {
  try {
    const sql = db(); await setup(sql);
    const url = new URL(req.url || "/", "https://portfolio.local");
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path === "/api/login" && req.method === "POST") {
      const input = await body(req);
      const rows = await sql.query("SELECT username, password_hash, password_salt FROM portfolio_admin WHERE id = 1");
      const admin = rows[0];
      if (!admin || String(input.username || "") !== admin.username || !(await checkPassword(input.password, admin))) return send(res, 401, { error: "Invalid username or password." });
      const token = crypto.randomBytes(32).toString("base64url");
      await sql.query("INSERT INTO portfolio_sessions (token_hash, expires_at) VALUES ($1, $2)", [hashToken(token), Date.now() + DAY]);
      return send(res, 200, { ok: true, username: admin.username }, { "Set-Cookie": cookieHeader(token, Math.floor(DAY / 1000)) });
    }
    if (path === "/api/session" && req.method === "GET") {
      const admin = await currentAdmin(sql, req);
      if (!admin) return send(res, 401, { error: "Please sign in." });
      return send(res, 200, { authenticated: true, username: admin.username });
    }
    if (path === "/api/logout" && req.method === "POST") {
      const token = cookieValue(req);
      if (token) await sql.query("DELETE FROM portfolio_sessions WHERE token_hash = $1", [hashToken(token)]);
      return send(res, 200, { ok: true }, { "Set-Cookie": cookieHeader("", 0) });
    }
    if (path === "/api/content" && req.method === "GET") {
      const rows = await sql.query("SELECT content FROM portfolio_data WHERE id = 1");
      if (!rows.length) {
        let initial = { site: {}, skills: [], tools: [], projects: [], services: [], education: [], experience: [], sections: {} };
        try {
          const origin = "https://" + String(req.headers["x-forwarded-host"] || req.headers.host || "").split(",")[0].trim();
          const response = await fetch(origin + "/content.json");
          if (response.ok) initial = await response.json();
        } catch (error) { console.error("Could not load initial portfolio content:", error); }
        await sql.query("INSERT INTO portfolio_data (id, content) VALUES (1, $1::jsonb) ON CONFLICT (id) DO NOTHING", [JSON.stringify(initial)]);
        return send(res, 200, initial);
      }
      return send(res, 200, rows[0].content);
    }
    if (path === "/api/content" && req.method === "PUT") {
      if (!(await currentAdmin(sql, req))) return send(res, 401, { error: "Please sign in again." });
      const input = await body(req);
      if (!input || typeof input !== "object" || Array.isArray(input)) return send(res, 400, { error: "Content must be a JSON object." });
      await sql.query("INSERT INTO portfolio_data (id, content) VALUES (1, $1::jsonb) ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content", [JSON.stringify(input)]);
      return send(res, 200, { ok: true });
    }
    if (path === "/api/account" && req.method === "POST") {
      const session = await currentAdmin(sql, req);
      if (!session) return send(res, 401, { error: "Please sign in again." });
      const input = await body(req);
      const rows = await sql.query("SELECT username, password_hash, password_salt FROM portfolio_admin WHERE id = 1");
      const admin = rows[0];
      if (!admin || !(await checkPassword(input.currentPassword, admin))) return send(res, 403, { error: "Current password is incorrect." });
      const username = String(input.username || "").trim(); const password = String(input.password || "");
      if (!username) return send(res, 400, { error: "Enter a username." });
      if (password.length < 12) return send(res, 400, { error: "Use a password with at least 12 characters." });
      const salt = crypto.randomBytes(16).toString("hex");
      const hash = (await scrypt(password, salt, 64)).toString("hex");
      await sql.query("UPDATE portfolio_admin SET username = $1, password_hash = $2, password_salt = $3 WHERE id = 1", [username, hash, salt]);
      await sql.query("DELETE FROM portfolio_sessions");
      return send(res, 200, { ok: true }, { "Set-Cookie": cookieHeader("", 0) });
    }
    return send(res, 404, { error: "API route not found." });
  } catch (err) {
    console.error("Portfolio API error:", err);
    return send(res, 500, { error: "Server error. Check the Vercel function logs and database configuration." });
  }
}