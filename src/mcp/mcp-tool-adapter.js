// src/mcp/mcp-tool-adapter.js — Integra servidores MCP ao Registry de Ferramentas do Chat IA

import { MCPClient } from "./mcp-client.js";
import { registerTool, unregisterTool } from "../tools/registry.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const activeClients = new Map();

export async function loadMCPServers() {
  let config = { servers: {} };
  try {
    const raw = await readFile(join(__dirname, "..", "..", "env", "mcp-servers.json"), "utf8");
    config = JSON.parse(raw);
  } catch {
    // Configuração inicial padrão
    config = {
      servers: {
        situ_design: {
          transport: "sse",
          url: "http://127.0.0.1:7124/mcp",
          label: "Situ Design MCP",
          enabled: false,
        },
      },
    };
  }

  for (const [id, srvConfig] of Object.entries(config.servers || {})) {
    if (!srvConfig.enabled) continue;
    try {
      await connectServer(id, srvConfig);
    } catch (err) {
      console.warn(`[MCP] Falha ao conectar '${id}':`, err.message);
    }
  }

  return getMCPStatus();
}

export async function connectServer(id, srvConfig) {
  if (activeClients.has(id)) {
    activeClients.get(id).disconnect();
  }

  const client = new MCPClient(id, srvConfig);
  await client.connect();
  activeClients.set(id, client);

  // Registra as tools no registry unificado
  for (const tool of client.tools) {
    const unifiedName = `mcp_${id}_${tool.name}`;
    registerTool({
      name: unifiedName,
      description: `[MCP: ${id}] ${tool.description || ""}`,
      schema: tool.inputSchema || { type: "object", properties: {} },
      requiresConfirmation: false,
      run: async (args) => {
        const result = await client.callTool(tool.name, args);
        return { ok: true, mcpServer: id, tool: tool.name, result };
      },
    });
  }

  console.log(`✓ Servidor MCP '${id}' conectado com ${client.tools.length} ferramenta(s)`);
  return client;
}

export function getMCPStatus() {
  const status = [];
  for (const [id, client] of activeClients.entries()) {
    status.push({
      id,
      name: client.name,
      toolsCount: client.tools.length,
      tools: client.tools.map((t) => t.name),
      connected: true,
    });
  }
  return status;
}
