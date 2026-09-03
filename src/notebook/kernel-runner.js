// src/notebook/kernel-runner.js — Executor de células interativas (JavaScript sandbox & PowerShell)

import vm from "node:vm";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

export async function runJavaScriptCell(code, context = {}) {
  const stdout = [];
  const startTime = Date.now();

  const customConsole = {
    log: (...args) => stdout.push(args.map(formatArg).join(" ")),
    warn: (...args) => stdout.push("[WARN] " + args.map(formatArg).join(" ")),
    error: (...args) => stdout.push("[ERROR] " + args.map(formatArg).join(" ")),
    table: (data) => stdout.push(JSON.stringify(data, null, 2)),
  };

  const sandbox = {
    console: customConsole,
    Buffer,
    setTimeout,
    clearTimeout,
    fetch,
    URL,
    Math,
    Date,
    JSON,
    ...context,
  };

  try {
    const script = new vm.Script(code, { filename: "cell.js" });
    const vmContext = vm.createContext(sandbox);

    // Timeout de 10s para evitar loops infinitos
    const result = script.runInContext(vmContext, { timeout: 10000 });
    const duration = Date.now() - startTime;

    return {
      ok: true,
      stdout: stdout.join("\n"),
      result: result !== undefined ? formatArg(result) : undefined,
      durationMs: duration,
    };
  } catch (err) {
    return {
      ok: false,
      stdout: stdout.join("\n"),
      error: err.message,
      durationMs: Date.now() - startTime,
    };
  }
}

export async function runPowerShellCell(cmd, launcherUrl = "http://127.0.0.1:7777") {
  const startTime = Date.now();

  // 1. Tenta via Launcher do Mestre do PC se disponível
  try {
    const valRes = await fetch(`${launcherUrl}/validate-command`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Mestre-Client": "v10-web" },
      body: JSON.stringify({ cmd }),
      signal: AbortSignal.timeout(3000),
    });

    if (valRes.ok) {
      const runRes = await fetch(`${launcherUrl}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Mestre-Client": "v10-web" },
        body: JSON.stringify({ cmd }),
      });

      if (runRes.ok) {
        const runData = await runRes.json();
        if (runData.jobId) {
          // Aguarda polling do job
          const deadline = Date.now() + 60000;
          while (Date.now() < deadline) {
            await new Promise((r) => setTimeout(r, 800));
            const stRes = await fetch(`${launcherUrl}/run-status?id=${encodeURIComponent(runData.jobId)}`, {
              headers: { "X-Mestre-Client": "v10-web" },
            });
            if (stRes.ok) {
              const st = await stRes.json();
              if (st.state !== "running") {
                return {
                  ok: st.success === true,
                  stdout: st.output || "",
                  durationMs: Date.now() - startTime,
                  via: "launcher",
                };
              }
            }
          }
        }
      }
    }
  } catch {}

  // 2. Fallback: Execução local PowerShell com timeout de segurança
  try {
    const { stdout, stderr } = await execAsync(
      `powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "${cmd.replace(/"/g, '`"')}"`,
      { timeout: 30000 }
    );
    return {
      ok: !stderr.trim(),
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      durationMs: Date.now() - startTime,
      via: "local-powershell",
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message,
      stdout: err.stdout || "",
      stderr: err.stderr || "",
      durationMs: Date.now() - startTime,
      via: "local-powershell",
    };
  }
}

function formatArg(arg) {
  if (arg === null) return "null";
  if (arg === undefined) return "undefined";
  if (typeof arg === "object") {
    try {
      return JSON.stringify(arg, null, 2);
    } catch {
      return String(arg);
    }
  }
  return String(arg);
}
