// providers/openrouter.js — OpenRouter (agregador multi-modelo)
// Reaproveita o módulo OpenAI (mesma API), só muda baseUrl/headers.

import { streamChat as openaiStream, listModels as openaiList } from "./openai.js";

export const id = "openrouter";
export const label = "OpenRouter";

export async function streamChat(payload, cfg) {
  return openaiStream(payload, {
    ...cfg,
    baseUrl: cfg.baseUrl || "https://openrouter.ai/api/v1",
  });
}

export async function listModels(cfg) {
  const models = await openaiList({ ...cfg, baseUrl: cfg.baseUrl || "https://openrouter.ai/api/v1" });
  return models;
}