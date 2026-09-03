// Chat IA — servidor standalone
// Serve a interface (index.html) e faz proxy das chamadas de API para o
// launcher do Mestre do PC V10 (http://127.0.0.1:7777).
// O proxy é server-side: o launcher só aceita "v10-web" vindo da origem dele,
// então este servidor repassa as chamadas como se fosse um cliente local.

import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { tts } from "./node_modules/edge-tts/out/index.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT || 7788);
const LAUNCHER_URL = process.env.LAUNCHER_URL || "http://127.0.0.1:7777";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
};

// Rotas de API consumidas pelo chat (relativas, mesma origem deste servidor)
const API_PREFIXES = [
  "/ping", "/ollama/", "/validate-command", "/run", "/run-status",
  "/memories", "/soul", "/security", "/operations", "/network",
];

function isApi(path) {
  return API_PREFIXES.some((p) => path === p || path.startsWith(p));
}

async function handleTTS(req, res) {
  if (req.method !== "POST") {
    res.writeHead(405, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({ error: "Method not allowed" }));
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({ error: "Invalid JSON" }));
  }
  const { text, voice = "pt-BR-FranciscaNeural" } = payload;
  if (!text || typeof text !== "string") {
    res.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    return res.end(JSON.stringify({ error: "Campo 'text' (string) obrigatório" }));
  }
  try {
    const audioBuffer = await tts(text, { voice });
    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.length,
      "Cache-Control": "no-cache",
      "Accept-Ranges": "bytes",
    });
    res.end(audioBuffer);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Erro Edge TTS", detail: String(err.message || err) }));
  }
}

async function proxy(req, res) {
  const url = new URL(req.url, LAUNCHER_URL);
  const headers = { ...req.headers, host: url.host };
  delete headers.origin; // server-side: launcher aceita v10-web sem origin
  delete headers.referer;

  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;

    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
    });

    const respHeaders = {};
    upstream.headers.forEach((v, k) => {
      if (!["transfer-encoding", "content-encoding", "access-control-allow-origin", "content-length"].includes(k)) {
        respHeaders[k] = v;
      }
    });

    res.writeHead(upstream.status, respHeaders);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Launcher offline", detail: String(err.message || err) }));
  }
}

async function serveStatic(req, res, path) {
  try {
    let file = path === "/" ? "/index.html" : path;
    const full = join(__dirname, file);
    // proteção path traversal
    if (!full.startsWith(__dirname)) throw new Error("forbidden");
    const st = await stat(full);
    if (!st.isFile()) throw new Error("not a file");
    const data = await readFile(full);
    res.writeHead(200, {
      "Content-Type": MIME[extname(full).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 — não encontrado no Chat IA");
  }
}

const server = http.createServer((req, res) => {
  const path = req.url.split("?")[0];
  if (path === "/api/tts") return handleTTS(req, res);
  if (isApi(path)) return proxy(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Mestre-Client",
    });
    return res.end();
  }
  return serveStatic(req, res, path);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`✅ Chat IA standalone em http://127.0.0.1:${PORT}`);
  console.log(`   Proxy para launcher: ${LAUNCHER_URL}`);
});