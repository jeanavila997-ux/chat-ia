// src/rag/vector-store.js — Armazenamento vetorial leve com persistência JSON

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getEmbedding, getEmbeddings, cosineSimilarity } from "./embeddings.js";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const STORE_PATH = join(__dirname, "..", "..", "data", "knowledge", "vectors.json");

export class VectorStore {
  constructor() {
    this.documents = []; // { id, title, chunk, embedding, metadata, createdAt }
    this.loaded = false;
  }

  async init() {
    if (this.loaded) return;
    try {
      await mkdir(dirname(STORE_PATH), { recursive: true });
      const raw = await readFile(STORE_PATH, "utf8");
      this.documents = JSON.parse(raw);
    } catch {
      this.documents = [];
    }
    this.loaded = true;
  }

  async save() {
    await mkdir(dirname(STORE_PATH), { recursive: true });
    await writeFile(STORE_PATH, JSON.stringify(this.documents, null, 2), "utf8");
  }

  /**
   * Adiciona um documento (um chunk). Mantido para compatibilidade.
   * Prefira addDocuments() ao indexar vários chunks: usa /api/embed em lote.
   */
  async addDocument(title, chunk, metadata = {}) {
    const [doc] = await this.addDocuments(title, [chunk], metadata);
    return doc;
  }

  /**
   * Adiciona vários chunks de uma vez, gerando os embeddings em uma só chamada.
   * Recusa misturar dimensões: um índice com vetores de modelos diferentes
   * produz cosine 0 e a busca degrada em silêncio.
   */
  async addDocuments(title, chunks, metadata = {}) {
    await this.init();
    const list = (chunks || []).filter((c) => typeof c === "string" && c.trim());
    if (!list.length) return [];

    const vectors = await getEmbeddings(list);
    const { dimensions, provider, model } = vectors[0];

    const existing = this.documents[0];
    if (existing && existing.embedding.length !== dimensions) {
      throw new Error(
        `Índice já usa vetores de ${existing.embedding.length} dimensões ` +
          `(${existing.metadata?.model || "desconhecido"}), mas o provedor atual gerou ${dimensions} (${model}). ` +
          "Limpe a base de conhecimento e reindexe com o mesmo provedor/modelo."
      );
    }

    const created = vectors.map((vec, i) => ({
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      chunk: list[i],
      embedding: vec.embedding,
      metadata: { ...metadata, provider: vec.provider, model: vec.model, dimensions, chunkIndex: i },
      createdAt: new Date().toISOString(),
    }));

    this.documents.push(...created);
    await this.save();
    return created;
  }

  async search(query, topK = 3, minScore = 0.25) {
    await this.init();
    if (!this.documents.length) return [];

    const { embedding: queryEmbedding, model } = await getEmbedding(query);
    const dimensions = queryEmbedding.length;

    // Só compara com vetores da mesma dimensão (mesmo modelo de embedding).
    const compatible = this.documents.filter((doc) => doc.embedding?.length === dimensions);
    if (!compatible.length) {
      const indexed = this.documents[0].embedding?.length;
      console.warn(
        `[RAG] Consulta gerou vetor de ${dimensions}d (${model}), mas o índice tem ${indexed}d. ` +
          "Reindexe com o mesmo modelo ou ajuste EMBEDDING_MODEL."
      );
      return [];
    }

    const scored = compatible.map((doc) => {
      const score = cosineSimilarity(queryEmbedding, doc.embedding);
      return {
        id: doc.id,
        title: doc.title,
        chunk: doc.chunk,
        score,
        metadata: doc.metadata,
      };
    });

    // Ordena por score decrescente
    scored.sort((a, b) => b.score - a.score);

    return scored.filter((item) => item.score >= minScore).slice(0, topK);
  }

  async listDocuments() {
    await this.init();
    const summary = {};
    for (const doc of this.documents) {
      const title = doc.title || "Sem título";
      if (!summary[title]) {
        summary[title] = { title, chunks: 0, lastAdded: doc.createdAt };
      }
      summary[title].chunks++;
    }
    return Object.values(summary);
  }

  async clearAll() {
    this.documents = [];
    await this.save();
    return { ok: true };
  }
}

export const defaultVectorStore = new VectorStore();
