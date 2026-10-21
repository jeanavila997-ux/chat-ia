// providers/ollama-cloud.js — Ollama Cloud, reutilizando a lógica do ollama.js.
//
// Configurado em env/providers.json como baseUrl "https://ollama.com/api" e
// envKey "OLLAMA_API_KEY". Existe como arquivo próprio porque o server.js
// resolve o provedor pelo nome do módulo (providers/<id>.js).

export * from "./ollama.js";
export const id = "ollama-cloud";
export const label = "Ollama Cloud";
