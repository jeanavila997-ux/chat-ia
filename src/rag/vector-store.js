// src/rag/vector-store.js — Armazenamento vetorial leve com persistência JSON

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getEmbedding, cosineSimilarity } from "./embeddings.js";

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

  async addDocument(title, chunk, metadata = {}) {
    await this.init();
    const { embedding, provider } = await getEmbedding(chunk);

    const doc = {
      id: `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      chunk,
      embedding,
      metadata: { ...metadata, provider },
      createdAt: new Date().toISOString(),
    };

    this.documents.push(doc);
    await this.save();
    return doc;
  }

  async search(query, topK = 3, minScore = 0.25) {
    await this.init();
    if (!this.documents.length) return [];

    const { embedding: queryEmbedding } = await getEmbedding(query);

    const scored = this.documents.map((doc) => {
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
