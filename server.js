// Chat IA — servidor standalone
// Serve a interface (index.html) e faz proxy das chamadas de API para o
// launcher do Mestre do PC V10 (http://127.0.0.1:7777).
// O proxy é server-side: o launcher só aceita "v10-web" vindo da origem dele,
// então este servidor repassa as chamadas como se fosse um cliente local.

import http from "node:http";
import { readFile, stat, readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { tts } from "./node_modules/edge-tts/out/index.js";
import { loadEnv } from "./env/load-env.js";

// Carrega env/.env (chaves) antes de qualquer uso — não sobrescreve o shell
loadEnv();

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT || 7789);
const LAUNCHER_URL = process.env.LAUNCHER_URL || "http://127.0.0.1:7777";

// Catálogo de provedores LLM (env/providers.json)
const providerCatalog = JSON.parse(
  await readFile(join(__dirname, "env", "providers.json"), "utf8")
);

// Catálogo de skills (env/skills.json) — invocáveis no chat via "/"
let skillCatalog = { skills: [] };
try {
  skillCatalog = JSON.parse(await readFile(join(__dirname, "env", "skills.json"), "utf8"));
} catch (e) {
  console.warn("⚠ skills.json ausente/inválido:", e.message);
}

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

// ===== Rotas de provedores LLM (/llm/*) =====
// Cada provedor converte seu formato nativo para JSON-lines estilo Ollama,
// assim o front (que já faz parse de chunk.message.content) funciona igual.

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function providerConfig(id) {
  return providerCatalog.providers[id] || null;
}

// Um provedor está "disponível" se tem módulo em providers/ OU é o ollama (via proxy)
async function availableProviderIds() {
  let hasModule = [];
  try {
    hasModule = (await readdir(join(__dirname, "providers")))
      .filter((f) => f.endsWith(".js"))
      .map((f) => f.replace(/\.js$/, ""));
  } catch {}
  return new Set(["ollama", ...hasModule]);
}

function listProviders(res) {
  return (async () => {
    const avail = await availableProviderIds();
    const providers = Object.entries(providerCatalog.providers).map(([id, p]) => ({
      id,
      label: p.label,
      baseUrl: p.baseUrl,
      hasKey: !p.envKey ? true : Boolean(process.env[p.envKey]),
      available: avail.has(id) || (!p.envKey ? true : Boolean(process.env[p.envKey])),
    }));
    sendJson(res, 200, { default: providerCatalog.default, providers });
  })();
}

function listAllModels(res) {
  return (async () => {
    const out = {};
    for (const [id, p] of Object.entries(providerCatalog.providers)) {
      out[id] = { label: p.label, hasKey: !p.envKey || Boolean(process.env[p.envKey]), models: p.models || [] };
    }
    sendJson(res, 200, out);
  })();
}

async function readBody(req, limit = 16 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error("body too large");
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function handleProviderChat(req, res, providerId) {
  const cfg = providerConfig(providerId);
  if (!cfg) return sendJson(res, 404, { error: `Provedor desconhecido: ${providerId}` });

  // ollama → repassa para o proxy do launcher (comportamento atual do front)
  if (providerId === "ollama") {
    try {
      const raw = JSON.parse((await readBody(req)).toString("utf8"));
      // Modo Auto: sem model → usa o primeiro modelo disponível do Ollama
      if (!raw.model) {
        const tags = await fetch(`${LAUNCHER_URL}/ollama/tags`, {
          headers: { "X-Mestre-Client": "v10-web" },
        });
        if (tags.ok) {
          const data = await tags.json();
          const first = (data.models || [])[0]?.name || (data.models || [])[0]?.model;
          if (first) raw.model = first;
        }
      }
      const upstream = await fetch(`${LAUNCHER_URL}/ollama/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Mestre-Client": "v10-web",
        },
        body: JSON.stringify(raw),
      });
      res.writeHead(upstream.status, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      const buf = Buffer.from(await upstream.arrayBuffer());
      return res.end(buf);
    } catch (err) {
      return sendJson(res, 502, { error: "Launcher offline", detail: String(err.message || err) });
    }
  }

  // demais provedores: carrega módulo dinamicamente
  const apiKey = cfg.envKey ? process.env[cfg.envKey] : null;
  if (cfg.envKey && !apiKey) {
    return sendJson(res, 400, { error: `Chave ${cfg.envKey} não configurada em env/.env` });
  }
  let mod;
  try {
    mod = await import(`./providers/${providerId}.js`);
  } catch {
    return sendJson(res, 501, { error: `Provedor ${providerId} ainda não implementado (crie providers/${providerId}.js)` });
  }

  try {
    const body = JSON.parse((await readBody(req)).toString("utf8"));
    const upstream = await mod.streamChat(body, { ...cfg, apiKey });
    if (!upstream.ok) {
      const errTxt = await upstream.text();
      return sendJson(res, 502, { error: `${providerId} HTTP ${upstream.status}`, detail: errTxt.slice(0, 300) });
    }
    // streaming: repassa o corpo já convertido (JSON-lines) direto ao cliente
    res.writeHead(200, { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache" });
    const buf = Buffer.from(await upstream.arrayBuffer());
    return res.end(buf);
  } catch (err) {
    return sendJson(res, 500, { error: `Erro no provedor ${providerId}`, detail: String(err.message || err) });
  }
}

async function handleProviderModels(req, res, providerId) {
  const cfg = providerConfig(providerId);
  if (!cfg) return sendJson(res, 404, { error: `Provedor desconhecido: ${providerId}` });
  if (providerId === "ollama") { req.url = "/ollama/tags"; return proxy(req, res); }
  let mod;
  try {
    mod = await import(`./providers/${providerId}.js`);
    if (typeof mod.listModels === "function") {
      const models = await mod.listModels({ ...cfg, apiKey: cfg.envKey ? process.env[cfg.envKey] : null });
      return sendJson(res, 200, { models });
    }
  } catch {}
  return sendJson(res, 200, { models: cfg.models || [] });
}

// ===== Skills (/api/skills) =====
// Executa skill do tipo "launcher": valida via /validate-command e roda via /run
// do launcher do V10 (mesmo fluxo do front, com confirmação no cliente).
async function handleSkillRun(req, res) {
  let body;
  try {
    body = JSON.parse((await readBody(req)).toString("utf8"));
  } catch {
    return sendJson(res, 400, { error: "Invalid JSON" });
  }
  const skill = skillCatalog.skills?.find((s) => s.id === body.id || s.command === body.id);
  if (!skill) return sendJson(res, 404, { error: `Skill desconhecida: ${body.id}` });

  if (skill.type === "launcher" && skill.launcher) {
    // Executa operação da whitelist via /run com {id} + polling /run-status
    try {
      const runRes = await fetch(`${LAUNCHER_URL}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Mestre-Client": "v10-web" },
        body: JSON.stringify({ id: skill.launcher }),
      });
      const runData = await runRes.json().catch(() => ({}));
      if (!runRes.ok || !runData.jobId) {
        return sendJson(res, runRes.status, { error: "Execução falhou", detail: runData });
      }
      // polling do job (timeout 90s)
      const deadline = Date.now() + 90000;
      let job = null;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 1000));
        const stRes = await fetch(`${LAUNCHER_URL}/run-status?id=${encodeURIComponent(runData.jobId)}`, {
          headers: { "X-Mestre-Client": "v10-web" },
        });
        if (!stRes.ok) break;
        const stData = await stRes.json().catch(() => ({}));
        if (stData.state !== "running") { job = stData; break; }
      }
      if (!job) return sendJson(res, 504, { error: "Timeout aguardando o comando" });
      return sendJson(res, 200, {
        ok: job.success === true,
        jobId: runData.jobId,
        state: job.state,
        output: job.output || "",
      });
    } catch (err) {
      return sendJson(res, 502, { error: "Launcher offline", detail: String(err.message || err) });
    }
  }

  return sendJson(res, 400, { error: `Skill ${skill.id} não é executável no servidor (tipo: ${skill.type})` });
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
  if (path === "/llm/providers") return listProviders(res);
  if (path === "/llm/models") return listAllModels(res);
  if (req.method === "POST" && path.startsWith("/llm/") && path.endsWith("/chat")) {
    const providerId = path.slice("/llm/".length, -"/chat".length);
    return handleProviderChat(req, res, providerId);
  }
  if (req.method === "GET" && path.startsWith("/llm/") && path.endsWith("/models")) {
    const providerId = path.slice("/llm/".length, -"/models".length);
    return handleProviderModels(req, res, providerId);
  }
  if (path === "/api/skills") {
    sendJson(res, 200, skillCatalog);
    return;
  }
  if (req.method === "POST" && path === "/api/skills/run") {
    return handleSkillRun(req, res);
  }
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