// src/tools/registry.js — Registro central e despachante de ferramentas do Chat IA

import * as webSearch from "./web-search.js";
import * as webFetch from "./web-fetch.js";
import { pcInfoTool, filesReadTool, filesWriteTool, calculatorTool } from "./system-tools.js";

const tools = new Map();

// Registra ferramentas padrão
registerTool(webSearch);
registerTool(webFetch);
registerTool(pcInfoTool);
registerTool(filesReadTool);
registerTool(filesWriteTool);
registerTool(calculatorTool);

export function registerTool(tool) {
  if (!tool || !tool.name || typeof tool.run !== "function") {
    throw new Error(`Tool inválida: deve conter 'name' e 'run'`);
  }
  tools.set(tool.name, {
    name: tool.name,
    description: tool.description || "",
    schema: tool.schema || { type: "object", properties: {} },
    requiresConfirmation: Boolean(tool.requiresConfirmation),
    run: tool.run,
  });
}

export function unregisterTool(name) {
  tools.delete(name);
}

export function getTool(name) {
  return tools.get(name);
}

export function listTools() {
  return Array.from(tools.values()).map((t) => ({
    name: t.name,
    description: t.description,
    schema: t.schema,
    requiresConfirmation: t.requiresConfirmation,
  }));
}

// Converte catálogo para o formato OpenAI Function Calling
export function getOpenAITools() {
  return Array.from(tools.values()).map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.schema,
    },
  }));
}

// Converte catálogo para o formato Anthropic Tools
export function getAnthropicTools() {
  return Array.from(tools.values()).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.schema,
  }));
}

// Executa ferramenta
export async function executeTool(name, args = {}, ctx = {}) {
  const tool = tools.get(name);
  if (!tool) {
    return { ok: false, error: `Ferramenta '${name}' não encontrada no registry.` };
  }

  // Verifica se requer confirmação prévia
  if (tool.requiresConfirmation && !ctx.confirmed) {
    return {
      ok: false,
      requiresConfirmation: true,
      tool: name,
      args,
      message: `A ferramenta '${name}' exige confirmação explícita do usuário antes de executar.`,
    };
  }

  try {
    const result = await tool.run(args, ctx);
    return result;
  } catch (err) {
    return { ok: false, error: `Falha ao executar '${name}': ${err.message}` };
  }
}
