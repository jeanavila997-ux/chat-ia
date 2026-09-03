// src/rag/chunker.js — Divisão semântica de textos e documentos para RAG

export function chunkText(text, options = {}) {
  const { chunkSize = 600, chunkOverlap = 80, minChunkSize = 100 } = options;

  if (!text || typeof text !== "string") return [];

  // Quebra por parágrafos primeiro (mantendo blocos com sentido semântico)
  const paragraphs = text.split(/\n\s*\n/);
  const chunks = [];
  let currentChunk = "";

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    if (currentChunk.length + trimmed.length + 2 <= chunkSize) {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmed;
    } else {
      if (currentChunk.length >= minChunkSize) {
        chunks.push(currentChunk);
      }

      // Se o parágrafo sozinho já é maior que o chunkSize, fatia por sentenças ou caracteres
      if (trimmed.length > chunkSize) {
        const sentences = trimmed.split(/(?<=[.?!])\s+/);
        let sentenceChunk = "";

        for (const sentence of sentences) {
          if (sentenceChunk.length + sentence.length + 1 <= chunkSize) {
            sentenceChunk += (sentenceChunk ? " " : "") + sentence;
          } else {
            if (sentenceChunk.length >= minChunkSize) {
              chunks.push(sentenceChunk);
            }
            // Overlap usando o final do chunk anterior
            const overlapText = sentenceChunk.slice(-chunkOverlap);
            sentenceChunk = (overlapText ? overlapText + " " : "") + sentence;
          }
        }
        currentChunk = sentenceChunk;
      } else {
        // Aplica overlap do chunk anterior
        const overlapText = currentChunk.slice(-chunkOverlap);
        currentChunk = (overlapText ? overlapText + "\n\n" : "") + trimmed;
      }
    }
  }

  if (currentChunk.length >= minChunkSize) {
    chunks.push(currentChunk);
  }

  return chunks;
}
