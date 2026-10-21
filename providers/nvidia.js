// providers/nvidia.js — NVIDIA (build.nvidia.com / NIM) — API OpenAI-compatible
// Free Endpoints servem para prototipagem. Uso comercial em produção exige
// confirmar a licença antes. Reaproveita o módulo OpenAI, só muda a baseUrl.

import { streamChat as openaiStream, listModels as openaiList } from "./openai.js";

export const id = "nvidia";
export const label = "NVIDIA";

const BASE_URL = "https://integrate.api.nvidia.com/v1";

export async function streamChat(payload, cfg) {
  return openaiStream(payload, {
    ...cfg,
    baseUrl: cfg.baseUrl || BASE_URL,
  });
}

// Lista ao vivo de /v1/models (inclui modelos não-chat, como embeddings e rerank)
export async function listModels(cfg) {
  return openaiList({
    ...cfg,
    baseUrl: cfg.baseUrl || BASE_URL,
  });
}
