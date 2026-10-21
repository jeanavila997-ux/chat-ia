// providers/9router.js — Gateway 9Router local (http://localhost:20128/v1)
// OpenAI-compatible; o roteia NVIDIA NIM e provedores adicionais conectados.
// Reaproveita o módulo OpenAI (mesma API), só muda baseUrl.

import { streamChat as openaiStream, listModels as openaiList } from "./openai.js";

export const id = "9router";
export const label = "9Router (gateway local)";

export async function streamChat(payload, cfg) {
  return openaiStream(payload, {
    ...cfg,
    baseUrl: cfg.baseUrl || "http://localhost:20128/v1",
  });
}

export async function listModels(cfg) {
  return openaiList({ ...cfg, baseUrl: cfg.baseUrl || "http://localhost:20128/v1" });
}