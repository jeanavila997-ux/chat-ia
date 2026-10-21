// src/rag/embeddings.js — Embeddings com múltiplos provedores e fallback local.
//
// Ordem: Ollama → Gemini → OpenAI → fallback local determinístico (128d).
//
// Ollama é o caminho preferido e usa o endpoint ATUAL `POST /api/embed`, que
// aceita lote e devolve vetores já normalizados (L2) — uma chamada para N
// chunks em vez de N chamadas ao endpoint legado `/api/embeddings`.
//
// Timeout: o endpoint legado usava 4s, mas o primeiro carregamento de um modelo
// de embedding pode passar de 10s (cold start). Isso fazia o fallback de 128d
// disparar em alguns chunks e não em outros, produzindo um índice com dimensões
// misturadas — e cosineSimilarity() devolve 0 quando as dimensões diferem, ou
// seja, a busca degradava em silêncio. Agora o timeout é configurável e o
// vector-store recusa comparar vetores de dimensões diferentes.

const DEFAULT_TIMEOUT_MS = Number(process.env.EMBEDDING_TIMEOUT_MS) || 60000;

// Normaliza para comprimento unitário (cosseno vira produto escalar).
function normalizeVector(vec) {
  let mag = 0;
  for (const v of vec) mag += v * v;
  mag = Math.sqrt(mag);
  if (mag === 0) return vec.slice();
  return vec.map((v) => v / mag);
}

// Similaridade de Cosseno entre dois vetores normalizados.
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB) return 0;
  // Dimensões diferentes = modelos diferentes; comparar daria resultado falso.
  if (vecA.length !== vecB.length) return 0;
  let dot = 0;
  for (let i = 0; i < vecA.length; i++) dot += vecA[i] * vecB[i];
  return dot;
}

function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) hash = (hash * 33) ^ str.charCodeAt(i);
  return hash;
}

// Vetorizador subword local leve de 128 dimensões (último recurso, sem rede).
function generateLocalVector(text, dimensions = 128) {
  const vec = new Array(dimensions).fill(0);
  const normalized = String(text).toLowerCase().replace(/[^a-z0-9áéíóúãõç\s]/g, " ");
  const words = normalized.split(/\s+/).filter((w) => w.length > 1);
  if (!words.length) return normalizeVector(vec);

  for (const word of words) {
    vec[Math.abs(simpleHash(word)) % dimensions] += 1.5;
    for (let i = 0; i <= word.length - 3; i++) {
      vec[Math.abs(simpleHash(word.slice(i, i + 3))) % dimensions] += 0.8;
    }
  }
  return normalizeVector(vec);
}

function localFallback(text) {
  return {
    embedding: generateLocalVector(text, 128),
    provider: "local-hashed",
    model: "subword-tfidf-128",
    dimensions: 128,
  };
}

function ollamaUrl() {
  return (process.env.OLLAMA_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
}

async function ollamaEmbedBatch(textos, { model, timeoutMs }) {
  const base = ollamaUrl();

  const res = await fetch(`${base}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: textos, truncate: true, keep_alive: "5m" }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (res.ok) {
    const data = await res.json();
    const vecs = data?.embeddings;
    if (Array.isArray(vecs) && vecs.length === textos.length) return vecs.map(normalizeVector);
    throw new Error("resposta inesperada de /api/embed");
  }

  // Servidor antigo sem /api/embed: cai para o legado, um texto por vez.
  if (res.status === 404) {
    const out = [];
    for (const texto of textos) {
      const legacy = await fetch(`${base}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: texto }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!legacy.ok) throw new Error(`HTTP ${legacy.status} em /api/embeddings`);
      const data = await legacy.json();
      if (!Array.isArray(data?.embedding)) throw new Error("resposta inesperada de /api/embeddings");
      out.push(normalizeVector(data.embedding));
    }
    return out;
  }

  throw new Error(`HTTP ${res.status} em /api/embed`);
}

async function geminiEmbed(text) {
  const key = process.env.GEMINI_API_KEY;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "models/text-embedding-004", content: { parts: [{ text }] } }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status} no Gemini`);
  const data = await res.json();
  const values = data.embedding?.values;
  if (!Array.isArray(values)) throw new Error("resposta inesperada do Gemini");
  return {
    embedding: normalizeVector(values),
    provider: "gemini",
    model: "text-embedding-004",
    dimensions: values.length,
  };
}

async function openaiEmbed(text) {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: "text-embedding-3-small", input: text }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} na OpenAI`);
  const data = await res.json();
  const vec = data.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error("resposta inesperada da OpenAI");
  return {
    embedding: normalizeVector(vec),
    provider: "openai",
    model: "text-embedding-3-small",
    dimensions: vec.length,
  };
}

async function embedOne(text, options = {}) {
  const provider = options.provider || process.env.EMBEDDING_PROVIDER || "auto";
  const model = options.model || process.env.EMBEDDING_MODEL || "nomic-embed-text";
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  if (provider === "ollama" || provider === "auto") {
    try {
      const [vec] = await ollamaEmbedBatch([text], { model, timeoutMs });
      return { embedding: vec, provider: "ollama", model, dimensions: vec.length };
    } catch (e) {
      // Provedor pedido explicitamente: propaga o erro em vez de mascarar.
      if (provider === "ollama") throw e;
      console.warn(`[RAG] Ollama indisponível (${e.message}); tentando próximo provedor.`);
    }
  }

  if ((provider === "gemini" || provider === "auto") && process.env.GEMINI_API_KEY) {
    try {
      return await geminiEmbed(text);
    } catch (e) {
      if (provider === "gemini") throw e;
      console.warn(`[RAG] Gemini indisponível (${e.message}); tentando próximo provedor.`);
    }
  }

  if ((provider === "openai" || provider === "auto") && process.env.OPENAI_API_KEY) {
    try {
      return await openaiEmbed(text);
    } catch (e) {
      if (provider === "openai") throw e;
      console.warn(`[RAG] OpenAI indisponível (${e.message}); usando fallback local.`);
    }
  }

  console.warn("[RAG] Nenhum provedor de embedding disponível; usando fallback local de 128d (qualidade reduzida).");
  return localFallback(text);
}

/**
 * Gera embeddings em lote — prefira esta função ao indexar vários chunks.
 * @param {string[]} textos
 * @returns {Promise<Array<{embedding: number[], provider: string, model: string, dimensions: number}>>}
 */
export async function getEmbeddings(textos, options = {}) {
  const list = (Array.isArray(textos) ? textos : [textos]).map((t) => String(t ?? ""));
  if (list.length === 0) return [];

  const provider = options.provider || process.env.EMBEDDING_PROVIDER || "auto";
  const model = options.model || process.env.EMBEDDING_MODEL || "nomic-embed-text";
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  // Lote de uma vez só no Ollama (economiza handshakes e cold start).
  if (provider === "ollama" || provider === "auto") {
    try {
      const vecs = await ollamaEmbedBatch(list, { model, timeoutMs });
      return vecs.map((embedding) => ({
        embedding,
        provider: "ollama",
        model,
        dimensions: embedding.length,
      }));
    } catch (e) {
      if (provider === "ollama") throw e;
      console.warn(`[RAG] Ollama indisponível (${e.message}); caindo para um por vez.`);
    }
  }

  const out = [];
  for (const texto of list) out.push(await embedOne(texto, options));
  return out;
}

/** Embedding de um único texto (compatibilidade com o código existente). */
export async function getEmbedding(text, options = {}) {
  const [first] = await getEmbeddings([text], options);
  return first;
}
