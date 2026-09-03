// src/rag/embeddings.js — Gerador universal de Embeddings com múltiplos provedores e fallback local

export async function getEmbedding(text, options = {}) {
  const provider = options.provider || process.env.EMBEDDING_PROVIDER || "auto";

  // 1. Tenta Ollama se solicitado ou no modo auto
  if (provider === "ollama" || provider === "auto") {
    try {
      const ollamaUrl = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
      const model = options.model || process.env.EMBEDDING_MODEL || "nomic-embed-text";

      const res = await fetch(`${ollamaUrl}/api/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: text }),
        signal: AbortSignal.timeout(4000),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.embedding && Array.isArray(data.embedding)) {
          return { embedding: normalizeVector(data.embedding), provider: "ollama", model };
        }
      }
    } catch {}
  }

  // 2. Tenta Google Gemini se chave estiver presente
  if ((provider === "gemini" || provider === "auto") && process.env.GEMINI_API_KEY) {
    try {
      const key = process.env.GEMINI_API_KEY;
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent?key=${key}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "models/text-embedding-004",
            content: { parts: [{ text }] },
          }),
          signal: AbortSignal.timeout(5000),
        }
      );

      if (res.ok) {
        const data = await res.json();
        const values = data.embedding?.values;
        if (values && Array.isArray(values)) {
          return { embedding: normalizeVector(values), provider: "gemini", model: "text-embedding-004" };
        }
      }
    } catch {}
  }

  // 3. Tenta OpenAI se chave estiver presente
  if ((provider === "openai" || provider === "auto") && process.env.OPENAI_API_KEY) {
    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: text,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        const data = await res.json();
        const vec = data.data?.[0]?.embedding;
        if (vec && Array.isArray(vec)) {
          return { embedding: normalizeVector(vec), provider: "openai", model: "text-embedding-3-small" };
        }
      }
    } catch {}
  }

  // 4. Fallback Local Determinístico (TF-IDF + Subword Hashing)
  // Permite RAG funcionar 100% offline mesmo sem chaves ou Ollama
  return {
    embedding: generateLocalVector(text, 128),
    provider: "local-hashed",
    model: "subword-tfidf-128",
  };
}

// Similaridade de Cosseno entre dois vetores normalizados
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  let dot = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
  }
  return dot;
}

function normalizeVector(vec) {
  let mag = 0;
  for (const v of vec) mag += v * v;
  mag = Math.sqrt(mag);
  if (mag === 0) return vec;
  return vec.map((v) => v / mag);
}

// Vetorizador subword local leve de 128 dimensões
function generateLocalVector(text, dimensions = 128) {
  const vec = new Array(dimensions).fill(0);
  const normalized = text.toLowerCase().replace(/[^a-z0-9áéíóúãõç\s]/g, " ");
  const words = normalized.split(/\s+/).filter((w) => w.length > 1);

  if (!words.length) return normalizeVector(vec);

  for (const word of words) {
    // Hasheia a palavra inteira
    const hash = simpleHash(word);
    const idx = Math.abs(hash) % dimensions;
    vec[idx] += 1.5;

    // Hasheia n-gramas de 3 caracteres para capturar variações semânticas e radicais
    for (let i = 0; i <= word.length - 3; i++) {
      const sub = word.slice(i, i + 3);
      const subHash = simpleHash(sub);
      const subIdx = Math.abs(subHash) % dimensions;
      vec[subIdx] += 0.8;
    }
  }

  return normalizeVector(vec);
}

function simpleHash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return hash;
}
