# tools/ — Ferramentas do agente

Plano de tools para o loop THINK → ACT → OBSERVE do Chat IA (estilo MCP):

## Contrato

```js
export const name = "web_search";
export const description = "Busca na web";
export const schema = { query: "string" };   // parâmetros esperados
export async function run(args, ctx) {
  // ctx: { fetchFn, confirm(), cwd }
  return { ok: true, result: "..." };        // ou { ok: false, error: "..." }
}
```

O registry (`tools/registry.js`) lista as tools para o system prompt e roteia
as chamadas de tool-use do modelo.

## Roadmap

| Tool | Arquivo | Ação | Risco |
| --- | --- | --- | --- |
| `web_search` | `web-search.js` | busca na web (DuckDuckGo HTML/brave) | leitura |
| `web_fetch` | `web-fetch.js` | baixa página e extrai texto | leitura |
| `run_command` | `run-command.js` | PowerShell via launcher `/validate-command` + `/run` (com confirmação) | alto — exige confirm |
| `pc_info` | `pc-info.js` | info do sistema via launcher | leitura |
| `files_read` | `files.js` | ler arquivo | leitura |
| `files_write` | `files.js` | escrever arquivo | médio — confirm |
| `memory` | `memory.js` | memórias persistentes via launcher `/memories` | baixo |
| `calculator` | `calculator.js` | cálculos exatos | leitura |

## Regras de segurança

- Toda tool de ESCRITA/execução passa pelo gate de confirmação do front
  (o modal de "Executar comando PowerShell" já existe).
- Tools nunca recebem chaves de API — só `ctx` limitado.
- Resultados truncados (máx ~4 KB) antes de voltar ao modelo.