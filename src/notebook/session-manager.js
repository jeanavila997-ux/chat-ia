// src/notebook/session-manager.js — Gerenciamento e persistência de notebooks interativos

import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const NOTEBOOKS_DIR = join(__dirname, "..", "..", "data", "notebooks");

export async function listNotebooks() {
  try {
    await mkdir(NOTEBOOKS_DIR, { recursive: true });
    const files = await readdir(NOTEBOOKS_DIR);
    const nbs = [];
    for (const f of files.filter((x) => x.endsWith(".json"))) {
      try {
        const raw = await readFile(join(NOTEBOOKS_DIR, f), "utf8");
        const parsed = JSON.parse(raw);
        nbs.push({
          id: parsed.id || f.replace(/\.json$/, ""),
          title: parsed.title || "Notebook sem título",
          cellCount: parsed.cells?.length || 0,
          updatedAt: parsed.updatedAt || "",
        });
      } catch {}
    }
    return nbs;
  } catch {
    return [];
  }
}

export async function getNotebook(id) {
  try {
    const file = join(NOTEBOOKS_DIR, `${id}.json`);
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    // Retorna notebook padrão se não existir
    return {
      id: id || "default",
      title: "Meu Notebook Interativo",
      updatedAt: new Date().toISOString(),
      cells: [
        {
          id: "cell_1",
          type: "markdown",
          source: "# 📓 Notebook Interativo Chat IA\nExecute células JavaScript ou comandos PowerShell interativamente.",
          output: "",
        },
        {
          id: "cell_2",
          type: "javascript",
          source: "// Teste JavaScript no sandbox\nconst cpu = { arch: 'x64', cores: 8 };\nconsole.log('Informações locais:', cpu);\n2 ** 10;",
          output: "",
        },
        {
          id: "cell_3",
          type: "powershell",
          source: "Get-Process | Sort-Object CPU -Descending | Select-Object -First 5 ProcessName, CPU, Id",
          output: "",
        },
      ],
    };
  }
}

export async function saveNotebook(notebook) {
  if (!notebook || !notebook.id) {
    throw new Error("Notebook deve ter um 'id'");
  }
  await mkdir(NOTEBOOKS_DIR, { recursive: true });
  notebook.updatedAt = new Date().toISOString();
  const file = join(NOTEBOOKS_DIR, `${notebook.id}.json`);
  await writeFile(file, JSON.stringify(notebook, null, 2), "utf8");
  return { ok: true, id: notebook.id };
}
