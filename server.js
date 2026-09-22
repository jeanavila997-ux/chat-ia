// Chat IA — servidor standalone com suporte a Multi-Provedores, RAG, MCP, Áudio e Notebook
// Serve a interface (index.html) e faz proxy seguro das chamadas de API para o launcher do Mestre do PC V10.

import http from "node:http";
import { readFile, stat, readdir } from "node:fs/promises";
import { join, extname, resolve, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { createReadStream } from "node:fs";
import { loadEnv } from "./env/load-env.js";

// Cache de arquivos estáticos em memória (produção)
const staticCache = new Map();
const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50MB
let currentCacheSize = 0;

// Módulos especializados
import { synthesizeTTSWithCache, VOICES } from "./src/audio/tts-service.js";
import { transcribeAudio } from "./src/audio/stt-service.js";
import { listTools, executeTool } from "./src/tools/registry.js";
import { loadMCPServers, getMCPStatus } from "./src/mcp/mcp-tool-adapter.js";
import { ingestDocument, queryRAG, getAugmentedPromptContext } from "./src/rag/rag-engine.js";
import { defaultVectorStore } from "./src/rag/vector-store.js";
import { runJavaScriptCell, runPowerShellCell } from "./src/notebook/kernel-runner.js";
import { listNotebooks, getNotebook, saveNotebook } from "./src/notebook/session-manager.js";

// Carrega variáveis de ambiente
loadEnv();

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.PORT || 7788);
const LAUNCHER_URL = process.env.LAUNCHER_URL || "http://127.0.0.1:7777";

// Inicializa servidores MCP em segundo plano (non-blocking)
setImmediate(() => {
  loadMCPServers().catch((e) => console.warn("[MCP] Erro ao carregar servidores:", e.message));
});

// Catálogo de provedores LLM (env/providers.json) - cacheado
let providerCatalog = { default: "ollama", providers: {} };
let skillCatalog = { skills: [] };

async function loadCatalogs() {
  try {
    providerCatalog = JSON.parse(await readFile(join(__dirname, "env", "providers.json"), "utf8"));
  } catch (e) {
    console.warn("⚠ providers.json ausente/inválido:", e.message);
  }
  try {
    skillCatalog = JSON.parse(await readFile(join(__dirname, "env", "skills.json"), "utf8"));
  } catch (e) {
    console.warn("⚠ skills.json ausente/inválido:", e.message);
  }
}

loadCatalogs();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
};

// Rotas de API consumidas pelo launcher V10
const API_PREFIXES = [
  "/ping", "/ollama/", "/validate-command", "/run", "/run-status",
  "/memories", "/soul", "/security", "/operations", "/network",
];

function isApi(path) {
  return API_PREFIXES.some((p) => path === p || path.startsWith(p));
}

function sendJson(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

// ===== Segurança de Origem (CORS Restrito a Localhost) =====
function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    return (
      u.hostname === "127.0.0.1" ||
      u.hostname === "localhost" ||
      u.hostname === "::1" ||
      u.hostname === "0.0.0.0"
    );
  } catch {
    return false;
  }
}

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (isAllowedOrigin(origin)) {
    if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Mestre-Client, Authorization");
    return true;
  }
  return false;
}

// ===== Leitura de Corpo de Requisição (Otimizada) =====
async function readBody(req, limit = 20 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new Error("Requisição excede o tamanho limite permitido.");
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

// ===== Pool de Conexões HTTP para Proxy (Reutilização de Sockets) =====
const agentCache = new Map();
function getAgent(url) {
  if (!agentCache.has(url)) {
    const { Agent } = require('node:http');
    agentCache.set(url, new Agent({ keepAlive: true, maxSockets: 50, maxFreeSockets: 10 }));
  }
  return agentCache.get(url);
}

// ===== Áudio: TTS com Cache & Catálogo =====
async function handleTTS(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Método não permitido" });
  }

  let payload;
  try {
    const raw = await readBody(req);
    payload = JSON.parse(raw.toString("utf8"));
  } catch {
    return sendJson(res, 400, { error: "JSON inválido" });
  }

  const { text, voice = "pt-BR-FranciscaNeural" } = payload;
  if (!text || typeof text !== "string") {
    return sendJson(res, 400, { error: "Campo 'text' obrigatório" });
  }

  try {
    const { buffer, cached } = await synthesizeTTSWithCache(text, { voice });
    res.writeHead(200, {
      "Content-Type": "audio/mpeg",
      "Content-Length": buffer.length,
      "Cache-Control": "public, max-age=86400",
      "X-From-Cache": cached ? "1" : "0",
    });
    res.end(buffer);
  } catch (err) {
    return sendJson(res, 500, { error: "Erro na síntese de voz", detail: err.message });
  }
}

// ===== Áudio: STT (Transcrição de Voz) =====
async function handleSTT(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, { error: "Método não permitido" });
  }

  try {
    const audioBuffer = await readBody(req);
    const mimeType = req.headers["content-type"] || "audio/webm";
    const result = await transcribeAudio(audioBuffer, mimeType);
    return sendJson(res, result.ok ? 200 : 400, result);
  } catch (err) {
    return sendJson(res, 500, { error: "Erro na transcrição", detail: err.message });
  }
}

// ===== Provedores LLM & Streaming Real =====
function providerConfig(id) {
  return providerCatalog.providers[id] || null;
}

async function availableProviderIds() {
  let hasModule = [];
  try {
    hasModule = (await readdir(join(__dirname, "providers")))
      .filter((f) => f.endsWith(".js"))
      .map((f) => f.replace(/\.js$/, ""));
  } catch {}
  return new Set(["ollama", ...hasModule]);
}

async function listProviders(res) {
  const avail = await availableProviderIds();
  const providers = Object.entries(providerCatalog.providers).map(([id, p]) => ({
    id,
    label: p.label,
    baseUrl: p.baseUrl,
    hasKey: !p.envKey ? true : Boolean(process.env[p.envKey]),
    available: avail.has(id) || (!p.envKey ? true : Boolean(process.env[p.envKey])),
  }));
  sendJson(res, 200, { default: providerCatalog.default, providers });
}

async function listAllModels(res) {
  const out = {};
  for (const [id, p] of Object.entries(providerCatalog.providers)) {
    out[id] = { label: p.label, hasKey: !p.envKey || Boolean(process.env[p.envKey]), models: p.models || [] };
  }
  sendJson(res, 200, out);
}

async function handleProviderChat(req, res, providerId) {
  const cfg = providerConfig(providerId);
  if (!cfg) return sendJson(res, 404, { error: `Provedor desconhecido: ${providerId}` });

  let raw;
  try {
    raw = JSON.parse((await readBody(req)).toString("utf8"));
  } catch {
    return sendJson(res, 400, { error: "JSON inválido" });
  }

  // Enriquecimento com RAG se habilitado
  if (raw.useRAG) {
    const lastUserMsg = (raw.messages || []).slice().reverse().find((m) => m.role === "user");
    if (lastUserMsg?.content) {
      const ragContext = await getAugmentedPromptContext(lastUserMsg.content, 3);
      if (ragContext) {
        const sysIndex = raw.messages.findIndex((m) => m.role === "system");
        if (sysIndex >= 0) {
          raw.messages[sysIndex].content += ragContext;
        } else {
          raw.messages.unshift({ role: "system", content: ragContext });
        }
      }
    }
  }

  // Provedor Ollama (repassado ao proxy do Launcher ou direto ao Ollama)
  if (providerId === "ollama") {
    try {
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
        headers: { "Content-Type": "application/json", "X-Mestre-Client": "v10-web" },
        body: JSON.stringify(raw),
      });

      res.writeHead(upstream.status, {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-cache",
      });

      // Streaming em tempo real (zero latência e sem buffer em memória)
      Readable.fromWeb(upstream.body).pipe(res);
      return;
    } catch (err) {
      return sendJson(res, 502, { error: "Launcher ou Ollama offline", detail: err.message });
    }
  }

  // Demais provedores dinâmicos
  const apiKey = cfg.envKey ? process.env[cfg.envKey] : null;
  if (cfg.envKey && !apiKey) {
    return sendJson(res, 400, { error: `Chave ${cfg.envKey} não configurada em env/.env` });
  }

  let mod;
  try {
    mod = await import(`./providers/${providerId}.js`);
  } catch {
    return sendJson(res, 501, { error: `Provedor ${providerId} ainda não implementado` });
  }

  try {
    const upstream = await mod.streamChat(raw, { ...cfg, apiKey });
    if (!upstream.ok) {
      const errTxt = await upstream.text();
      return sendJson(res, 502, { error: `${providerId} HTTP ${upstream.status}`, detail: errTxt.slice(0, 300) });
    }

    res.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    });

    // Transmissão direta dos chunks em tempo real para o cliente
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    return sendJson(res, 500, { error: `Erro no provedor ${providerId}`, detail: err.message });
  }
}

async function handleProviderModels(req, res, providerId) {
  const cfg = providerConfig(providerId);
  if (!cfg) return sendJson(res, 404, { error: `Provedor desconhecido: ${providerId}` });
  if (providerId === "ollama") { req.url = "/ollama/tags"; return proxy(req, res); }
  try {
    const mod = await import(`./providers/${providerId}.js`);
    if (typeof mod.listModels === "function") {
      const models = await mod.listModels({ ...cfg, apiKey: cfg.envKey ? process.env[cfg.envKey] : null });
      return sendJson(res, 200, { models });
    }
  } catch {}
  return sendJson(res, 200, { models: cfg.models || [] });
}

// ===== Proxy Seguro para o Launcher do Mestre do PC (Otimizado) =====
async function proxy(req, res) {
  const url = new URL(req.url, LAUNCHER_URL);
  const headers = { ...req.headers, host: url.host };
  delete headers.origin;
  delete headers.referer;

  try {
    // Otimização: usa stream direto para evitar buffer duplo
    const upstream = await fetch(url, {
      method: req.method,
      headers,
      body: ["GET", "HEAD"].includes(req.method) ? undefined : req,
      duplex: 'half', // Necessário para streaming de body
    });

    const respHeaders = {};
    upstream.headers.forEach((v, k) => {
      if (!["transfer-encoding", "content-encoding", "access-control-allow-origin", "content-length"].includes(k)) {
        respHeaders[k] = v;
      }
    });

    res.writeHead(upstream.status, respHeaders);
    
    // Streaming direto sem buffer em memória
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (err) {
    return sendJson(res, 502, { error: "Launcher offline", detail: err.message });
  }
}

// ===== Servidor de Arquivos Estáticos com Proteção contra Path Traversal e Cache =====
async function serveStatic(req, res, path) {
  try {
    const cleanPath = decodeURIComponent(path.split("?")[0]);
    const file = cleanPath === "/" ? "/index.html" : cleanPath;
    const full = resolve(join(__dirname, file));
    const base = normalize(__dirname);

    if (!full.startsWith(base)) {
      res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("403 — Acesso negado");
    }

    // Verifica cache em memória
    const cached = staticCache.get(full);
    if (cached) {
      // Valida se o arquivo não foi modificado
      const st = await stat(full);
      if (st.mtimeMs <= cached.mtime) {
        res.writeHead(200, {
          "Content-Type": MIME[extname(full).toLowerCase()] || "application/octet-stream",
          "Cache-Control": "public, max-age=3600",
          "ETag": `"${cached.etag}"`,
        });
        res.end(cached.buffer);
        return;
      }
      // Remove cache obsoleto
      staticCache.delete(full);
      currentCacheSize -= cached.buffer.length;
    }

    const st = await stat(full);
    if (!st.isFile()) throw new Error("Não é arquivo");

    const data = await readFile(full);
    
    // Armazena em cache se dentro do limite
    if (currentCacheSize + data.length < MAX_CACHE_SIZE) {
      const etag = `${st.size}-${st.mtimeMs}`;
      staticCache.set(full, { buffer: data, mtime: st.mtimeMs, etag });
      currentCacheSize += data.length;
    }

    res.writeHead(200, {
      "Content-Type": MIME[extname(full).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "public, max-age=3600",
      "ETag": `"${cached?.etag || `${st.size}-${st.mtimeMs}`}"`,
    });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404 — Não encontrado no Chat IA");
  }
}

// ===== Servidor HTTP Principal =====
const server = http.createServer(async (req, res) => {
  // 1. Validação de CORS
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  const path = req.url.split("?")[0];

  // 2. Roteamento de Áudio
  if (path === "/api/tts") return handleTTS(req, res);
  if (path === "/api/tts/voices") return sendJson(res, 200, { voices: VOICES });
  if (path === "/api/audio/transcribe") return handleSTT(req, res);

  // 3. Roteamento de Ferramentas (Tools & MCP)
  if (path === "/api/tools" && req.method === "GET") {
    return sendJson(res, 200, { tools: listTools() });
  }
  if (path === "/api/tools/run" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)).toString("utf8"));
      const result = await executeTool(body.name, body.args || {}, { confirmed: body.confirmed === true });
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }
  if (path === "/api/mcp/status" && req.method === "GET") {
    return sendJson(res, 200, { servers: getMCPStatus() });
  }

  // 4. Roteamento de RAG (Base de Conhecimento & Embeddings)
  if (path === "/api/rag/ingest" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)).toString("utf8"));
      const result = await ingestDocument(body.title || "Documento", body.text, body.metadata);
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }
  if (path === "/api/rag/query" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)).toString("utf8"));
      const result = await queryRAG(body.query, body.topK || 3);
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }
  if (path === "/api/rag/documents" && req.method === "GET") {
    const docs = await defaultVectorStore.listDocuments();
    return sendJson(res, 200, { documents: docs });
  }

  // 5. Roteamento de Notebook Interativo
  if (path === "/api/notebook/run" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)).toString("utf8"));
      if (body.type === "javascript" || body.type === "js") {
        const result = await runJavaScriptCell(body.code || "");
        return sendJson(res, 200, result);
      } else if (body.type === "powershell" || body.type === "ps1") {
        const result = await runPowerShellCell(body.code || "", LAUNCHER_URL);
        return sendJson(res, 200, result);
      }
      return sendJson(res, 400, { ok: false, error: `Tipo de célula '${body.type}' não suportado.` });
    } catch (err) {
      return sendJson(res, 500, { ok: false, error: err.message });
    }
  }
  if (path === "/api/notebook/list" && req.method === "GET") {
    const nbs = await listNotebooks();
    return sendJson(res, 200, { notebooks: nbs });
  }
  if (path === "/api/notebook/get" && req.method === "GET") {
    const u = new URL(req.url, "http://localhost");
    const nb = await getNotebook(u.searchParams.get("id") || "default");
    return sendJson(res, 200, nb);
  }
  if (path === "/api/notebook/save" && req.method === "POST") {
    try {
      const body = JSON.parse((await readBody(req)).toString("utf8"));
      const result = await saveNotebook(body);
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message });
    }
  }

  // 6. Roteamento de Modelos LLM
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

  // 7. Skills
  if (path === "/api/skills") return sendJson(res, 200, skillCatalog);

  // 8. Proxy para APIs do Launcher
  if (isApi(path)) return proxy(req, res);

  // 9. Arquivos Estáticos
  return serveStatic(req, res, path);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`✅ Chat IA em http://127.0.0.1:${PORT}`);
  console.log(`   Proxy para launcher: ${LAUNCHER_URL}`);
  console.log(`   RAG, MCP, Áudio e Notebook ativos`);
});