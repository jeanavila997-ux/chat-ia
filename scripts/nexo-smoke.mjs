// scripts/nexo-smoke.mjs — valida a integração chat-ia ↔ nexo-core via MCP stdio.
// Uso: node scripts/nexo-smoke.mjs
import { loadMCPServers } from "../src/mcp/mcp-tool-adapter.js";
import { executeTool } from "../src/tools/registry.js";

const status = await loadMCPServers();
console.log("MCP ativos:", status.map((s) => `${s.id}(${s.toolsCount} tools)`).join(", "));
const nexo = status.find((s) => s.id === "nexo");
if (!nexo) {
  console.error("FALHA: nexo não conectado.");
  process.exit(1);
}

// 1. Busca no catálogo via MCP
const search = await executeTool("mcp_nexo_catalog_search", { q: "limpar temp", limit: 2 });
const searchText = search.result?.content?.[0]?.text ?? "";
console.log("catalog_search:", searchText.split("\n")[0]);
if (!searchText.includes("limpar_temp_usuario")) {
  console.error("FALHA: busca não retornou o comando esperado.");
  process.exit(1);
}

// 2. Gate determinístico: destrutivo sem confirm deve vir BLOQUEADO (isError)
const gate = await executeTool("mcp_nexo_catalog_run", { id: "limpeza_profunda_tudo" });
const gateText = gate.result?.content?.[0]?.text ?? "";
const blocked = gate.result?.isError === true && /DESTRUTIVO/.test(gateText);
console.log("gate destrutivo:", blocked ? "BLOQUEADO corretamente" : "FALHA: não bloqueou");
process.exit(blocked ? 0 : 1);
