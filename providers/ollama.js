// providers/ollama.js — provedor Ollama falando DIRETO com a API (local ou cloud)
//
// Antes, o chat-ia só alcançava o Ollama através do proxy do Launcher do
// Mestre do PC (127.0.0.1:7777), então o chat parava se o launcher estivesse
// fora do ar. Este módulo permite conversar direto com:
//
//   - local:  http://127.0.0.1:11434   (sem chave)
//   - cloud:  https://ollama.com/api   (OLLAMA_API_KEY)
//
// A escolha vem de cfg.baseUrl (env/providers.json); na falta dele, usa
// OLLAMA_URL ou decide pela presença de OLLAMA_API_KEY.
//
// O stream devolvido já está em JSON-lines no formato do Ollama
// ({"message":{"content":...},"done":false}), que é o que o front consome.

export const id = "ollama";
export const label = "Ollama";

// A API vive sob /api. O baseUrl pode chegar nas duas formas:
//   https://ollama.com/api        (como a doc oficial mostra)
//   http://127.0.0.1:11434        (host puro)
// Normalizamos para sempre terminar em /api, evitando /api/api/chat.
function apiRoot(base) {
  const trimmed = String(base).replace(/\/+$/, "");
  return /\/api$/i.test(trimmed) ? trimmed : `${trimmed}/api`;
}

function resolveEndpoint(cfg) {
  const apiKey = cfg?.apiKey || process.env.OLLAMA_API_KEY || "";
  const raw =
    cfg?.baseUrl ||
    process.env.OLLAMA_URL ||
    (apiKey ? "https://ollama.com/api" : "http://127.0.0.1:11434");
  return { base: apiRoot(raw), apiKey };
}

function headers(apiKey) {
  const h = { "Content-Type": "application/json" };
  if (apiKey) h.Authorization = `Bearer ${apiKey}`;
  return h;
}

export async function streamChat(payload, cfg) {
  const { base, apiKey } = resolveEndpoint(cfg);
  const model = payload?.model || cfg?.models?.[0];
  if (!model) {
    return new Response(JSON.stringify({ error: "Nenhum modelo definido para o provedor Ollama." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Remove o que é do chat-ia e não pertence à API do Ollama.
  const { useRAG, ...rest } = payload || {};
  const body = { ...rest, model, stream: true };
  if (body.keep_alive === undefined) body.keep_alive = "5m";

  const resp = await fetch(`${base}/chat`, {
    method: "POST",
    headers: headers(apiKey),
    body: JSON.stringify(body),
  });

  if (!resp.ok) return resp; // o chamador converte em erro HTTP com o detalhe

  return new Response(resp.body, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8" },
  });
}

export async function listModels(cfg) {
  const { base, apiKey } = resolveEndpoint(cfg);
  try {
    const resp = await fetch(`${base}/tags`, { headers: headers(apiKey) });
    if (!resp.ok) return cfg?.models || [];
    const data = await resp.json();
    const names = (data.models || []).map((m) => m.name || m.model).filter(Boolean);
    return names.length ? names : cfg?.models || [];
  } catch {
    return cfg?.models || [];
  }
}

/** Checagem rápida de disponibilidade (usada por /ping e diagnóstico). */
export async function health(cfg) {
  const { base, apiKey } = resolveEndpoint(cfg);
  try {
    const resp = await fetch(`${base}/tags`, {
      headers: headers(apiKey),
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return { ok: false, base, status: resp.status };
    const data = await resp.json();
    return { ok: true, base, models: (data.models || []).length };
  } catch (e) {
    return { ok: false, base, error: e.message };
  }
}
