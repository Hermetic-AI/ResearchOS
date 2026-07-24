import type { CompileResult } from "./types"

export async function compile(mainFile: string, workdir?: string): Promise<CompileResult> {
  const dir = workdir ?? "."
  try {
    const proc = Bun.spawn(["tectonic", mainFile], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    const ok = proc.exitCode === 0
    const log = stdout + "\n" + stderr
    const errors = parseLogErrors(log)
    const pdfPath = ok ? mainFile.replace(/\.tex$/, ".pdf") : undefined
    return { ok, pdfPath, log, errors }
  } catch (err) {
    return { ok: false, log: String(err), errors: [] }
  }
}

export function parseLogErrors(log: string): Array<{ file: string; line: number; message: string }> {
  const errors: Array<{ file: string; line: number; message: string }> = []
  const lines = log.split("\n")
  for (const line of lines) {
    const match = line.match(/^(.+):(\d+):\s+(.+)$/)
    if (match) {
      errors.push({ file: match[1], line: parseInt(match[2], 10), message: match[3] })
    }
    if (line.startsWith("! ")) {
      errors.push({ file: mainFileFromLog(log) ?? "unknown", line: 0, message: line.slice(2) })
    }
  }
  return errors
}

function mainFileFromLog(_log: string): string | null {
  return null
}

export function detectMainFile(dir: string): string | null {
  const { readdirSync, readFileSync, existsSync } = require("fs") as any
  if (!existsSync(dir)) return null
  const files = readdirSync(dir).filter((f: string) => f.endsWith(".tex"))
  for (const f of files) {
    const content = readFileSync(join(dir, f), "utf-8")
    if (content.includes("\\documentclass")) return f
  }
  return files[0] ?? null
}
