import { existsSync, mkdirSync, readFileSync, readdirSync } from "fs"
import { basename, join, resolve, sep } from "path"
import { binDir, buildDir } from "./paths"
import type { CompileResponse, LatexError } from "./types"

const DEFAULT_TIMEOUT_MS = 120_000

export interface CompileInput {
  projectRoot: string
  mainFile: string
  env?: Record<string, string | undefined>
  timeoutMs?: number
}

// 定位顺序：RESEARCHOS_TECTONIC env → 项目 .researchos/latex/bin/ → PATH
export function locateTectonic(projectRoot: string, env: Record<string, string | undefined> = process.env): string | null {
  const fromEnv = env.RESEARCHOS_TECTONIC
  if (fromEnv && existsSync(fromEnv)) return fromEnv
  const binary = process.platform === "win32" ? "tectonic.exe" : "tectonic"
  const fromProject = join(binDir(projectRoot), binary)
  if (existsSync(fromProject)) return fromProject
  return Bun.which(binary) ?? Bun.which("tectonic")
}

export async function compile(input: CompileInput): Promise<CompileResponse> {
  const env = input.env ?? process.env
  const root = resolve(input.projectRoot)
  const mainFile = resolve(root, input.mainFile)
  // 安全白名单：编译目标必须位于项目根内
  if (!mainFile.startsWith(root + sep)) throw new Error(`main_file escapes project root: ${input.mainFile}`)
  if (!existsSync(mainFile)) throw new Error(`main_file not found: ${input.mainFile}`)

  const tectonic = locateTectonic(root, env)
  if (!tectonic) {
    return {
      available: false,
      message: "Tectonic binary not found",
      installHint:
        "Install Tectonic (https://tectonic-typesetting.github.io): set RESEARCHOS_TECTONIC to the binary path, " +
        "place it in .researchos/latex/bin/, or add it to PATH.",
    }
  }

  const outdir = buildDir(root)
  mkdirSync(outdir, { recursive: true })
  const started = Date.now()
  const proc = Bun.spawn([tectonic, "--keep-logs", "--synctex", "--outdir", outdir, mainFile], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  })
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timer = setTimeout(() => proc.kill(), timeoutMs)
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).finally(() => clearTimeout(timer))
  const timedOut = Date.now() - started >= timeoutMs && exitCode === null
  const log = [stdout, stderr].filter(Boolean).join("\n")

  const base = basename(input.mainFile).replace(/\.tex$/, "")
  const pdf = join(outdir, `${base}.pdf`)
  const logFile = join(outdir, `${base}.log`)
  const diagnostics = dedupeDiagnostics([
    ...parseTectonicLog(log),
    ...(existsSync(logFile) ? parseTectonicLog(readFileSync(logFile, "utf8")) : []),
  ])

  return {
    available: true,
    ok: exitCode === 0 && !timedOut && existsSync(pdf),
    ...(existsSync(pdf) ? { pdfPath: pdf } : {}),
    log: timedOut ? `${log}\ncompile timed out after ${timeoutMs}ms` : log,
    errors: diagnostics,
    durationMs: Date.now() - started,
  }
}

// 双源提取（设计 §6.1）：stderr 的 file:line: 与 error:/warning: 行 + .log 的 `!`/`l.<n>` 行对 + bad box
export function parseTectonicLog(log: string): LatexError[] {
  const lines = log.split("\n")
  const bangErrors = lines.flatMap((line, index) => {
    if (!line.startsWith("!")) return []
    const location = lines.slice(index + 1, index + 4).map((candidate) => /^l\.(\d+)/.exec(candidate)?.[1]).find(Boolean)
    return [{ file: "", line: location ? Number(location) : 0, message: line.replace(/^!\s*/, ""), severity: "error" as const }]
  })
  const direct = lines.flatMap((line): LatexError[] => {
    const taggedError = /^error:\s*(\S+\.tex):(\d+):\s*(.+)$/.exec(line)
    if (taggedError?.[1] && taggedError[2] && taggedError[3]) {
      return [{ file: taggedError[1], line: Number(taggedError[2]), message: taggedError[3], severity: "error" as const }]
    }
    const taggedWarning = /^warning:\s*(\S+\.tex):(\d+):\s*(.+)$/.exec(line)
    if (taggedWarning?.[1] && taggedWarning[2] && taggedWarning[3]) {
      return [{ file: taggedWarning[1], line: Number(taggedWarning[2]), message: taggedWarning[3], severity: "warning" as const }]
    }
    const fileLine = /^(\S+\.tex):(\d+):\s*(.+)$/.exec(line)
    if (fileLine?.[1] && fileLine[2] && fileLine[3]) {
      return [{ file: fileLine[1], line: Number(fileLine[2]), message: fileLine[3], severity: "error" as const }]
    }
    const error = /^error:\s*(.+)$/.exec(line)
    if (error?.[1]) return [{ file: "", line: 0, message: error[1], severity: "error" as const }]
    const warning = /^(?:LaTeX )?[Ww]arning:\s*(.+)$/.exec(line)
    if (warning?.[1]) return [{ file: "", line: 0, message: warning[1], severity: "warning" as const }]
    const badBox = /^(Over|Under)full \\[hv]box.*$/.exec(line)
    if (badBox?.[0]) return [{ file: "", line: 0, message: badBox[0], severity: "warning" as const }]
    return []
  })
  return [...bangErrors, ...direct]
}

function dedupeDiagnostics(errors: LatexError[]): LatexError[] {
  const seen = new Set<string>()
  return errors.filter((error) => {
    const key = `${error.file}:${error.line}:${error.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function detectMainFile(dir: string): string | null {
  if (!existsSync(dir)) return null
  const files = readdirSync(dir).filter((file) => file.endsWith(".tex"))
  return files.find((file) => readFileSync(join(dir, file), "utf-8").includes("\\documentclass")) ?? files[0] ?? null
}
