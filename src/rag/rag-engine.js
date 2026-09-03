// src/rag/rag-engine.js — Orquestrador do fluxo RAG (Ingestão e Recuperação de Contexto)

import { chunkText } from "./chunker.js";
import { defaultVectorStore } from "./vector-store.js";

export async function ingestDocument(title, text, metadata = {}) {
  if (!text || typeof text !== "string") {
    return { ok: false, error: "Texto inválido ou vazio para ingestão" };
  }

  const chunks = chunkText(text, { chunkSize: 500, chunkOverlap: 60 });
  if (!chunks.length) {
    return { ok: false, error: "Nenhum fragmento gerado a partir do texto" };
  }

  const addedDocs = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunkTitle = `${title} [Parte ${i + 1}/${chunks.length}]`;
    const doc = await defaultVectorStore.addDocument(chunkTitle, chunks[i], {
      ...metadata,
      sourceTitle: title,
      chunkIndex: i,
      totalChunks: chunks.length,
    });
    addedDocs.push(doc.id);
  }

  return {
    ok: true,
    title,
    chunksCreated: chunks.length,
    documentIds: addedDocs,
  };
}

export async function queryRAG(query, topK = 3) {
  const matches = await defaultVectorStore.search(query, topK);
  return {
    query,
    count: matches.length,
    results: matches,
  };
}

export async function getAugmentedPromptContext(query, topK = 3) {
  const matches = await defaultVectorStore.search(query, topK, 0.28);
  if (!matches.length) return "";

  let prompt = "\n\n--- BASE DE CONHECIMENTO RELEVANTE (RAG) ---\n";
  prompt += "Utilize as informações verificadas abaixo para enriquecer sua resposta com precisão técnica:\n\n";

  for (const match of matches) {
    prompt += `[Fonte: ${match.title} | Relevância: ${(match.score * 100).toFixed(1)}%]\n`;
    prompt += `${match.chunk}\n\n`;
  }
  prompt += "--- FIM DA BASE DE CONHECIMENTO ---\n";

  return prompt;
}
