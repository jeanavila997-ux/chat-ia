// providers/groq.js — Groq (Llama/Qwen ultra-rápido) — API OpenAI-compatible

import { streamChat as openaiStream, listModels as openaiList } from "./openai.js";

export const id = "groq";
export const label = "Groq";

export async function streamChat(payload, cfg) {
  return openaiStream(payload, {
    ...cfg,
    baseUrl: cfg.baseUrl || "https://api.groq.com/openai/v1",
  });
}

export async function listModels(cfg) {
  return openaiList({ ...cfg, baseUrl: cfg.baseUrl || "https://api.groq.com/openai/v1" });
}