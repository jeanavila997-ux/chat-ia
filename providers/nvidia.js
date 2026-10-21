// providers/nvidia.js — NVIDIA NIM (build.nvidia.com)
// API OpenAI-compatible em https://integrate.api.nvidia.com/v1 — reusa openai.js.

import { streamChat as openaiStream, listModels as openaiList } from "./openai.js";

export const id = "nvidia";
export const label = "NVIDIA NIM";

export async function streamChat(payload, cfg) {
  return openaiStream(payload, {
    ...cfg,
    baseUrl: cfg.baseUrl || "https://integrate.api.nvidia.com/v1",
  });
}

export async function listModels(cfg) {
  return openaiList({ ...cfg, baseUrl: cfg.baseUrl || "https://integrate.api.nvidia.com/v1" });
}