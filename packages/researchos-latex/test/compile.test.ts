import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdir, mkdtemp, rm, writeFile } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { compile, locateTectonic, parseTectonicLog } from "../src/compile"
import { binDir } from "../src/paths"

// 符合真实 Tectonic 输出格式的样例（stderr 结构 + .log 的 !/l. 行对）
const TECTONIC_STDERR = [
  "note: this is a BETA release",
  "error: main.tex:12: Undefined control sequence",
  "warning: main.tex:20: Citation 'missing' undefined",
  "Overfull \\hbox (12.0pt too wide) in paragraph at lines 30--31",
].join("\n")

const TEX_LOG = [
  "This is Tectonic",
  "! Undefined control sequence.",
  "l.12 \\badcommand",
  "   ",
  "! LaTeX Error: File `missing.sty' not found.",
  "l.15 \\usepackage{missing}",
  "LaTeX Warning: Reference `sec:nope' on page 1 undefined",
].join("\n")

describe("parseTectonicLog", () => {
  test("extracts error/warning/bad-box diagnostics from stderr format", () => {
    const errors = parseTectonicLog(TECTONIC_STDERR)
    expect(errors).toContainEqual({ file: "main.tex", line: 12, message: "Undefined control sequence", severity: "error" })
    expect(errors).toContainEqual({ file: "main.tex", line: 20, message: "Citation 'missing' undefined", severity: "warning" })
    expect(errors.some((error) => error.severity === "warning" && error.message.startsWith("Overfull \\hbox"))).toBe(true)
  })

  test("extracts bang + l.line pairs from .log format", () => {
    const errors = parseTectonicLog(TEX_LOG)
    expect(errors).toContainEqual({ file: "", line: 12, message: "Undefined control sequence.", severity: "error" })
    expect(errors).toContainEqual({ file: "", line: 15, message: "LaTeX Error: File `missing.sty' not found.", severity: "error" })
    expect(errors.some((error) => error.severity === "warning" && error.message.includes("Reference"))).toBe(true)
  })
})

describe("locateTectonic", () => {
  let dir: string

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "latex-compile-"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  })

  test("prefers env override, then project bin, then PATH", async () => {
    await mkdir(join(dir, "fake"), { recursive: true })
    const envBinary = join(dir, "fake", "tectonic-custom")
    await writeFile(envBinary, "")
    expect(locateTectonic(dir, { RESEARCHOS_TECTONIC: envBinary })).toBe(envBinary)

    await mkdir(binDir(dir), { recursive: true })
    const projectBinary = join(binDir(dir), process.platform === "win32" ? "tectonic.exe" : "tectonic")
    await writeFile(projectBinary, "")
    expect(locateTectonic(dir, {})).toBe(projectBinary)

    expect(locateTectonic(dir, { RESEARCHOS_TECTONIC: join(dir, "missing-binary") })).toBe(projectBinary)
  })

  test("compile reports honest unavailability when no binary exists", async () => {
    await writeFile(join(dir, "main.tex"), "\\documentclass{article}\n\\begin{document}\nHi\n\\end{document}\n")
    const result = await compile({
      projectRoot: dir,
      mainFile: "main.tex",
      env: { RESEARCHOS_TECTONIC: join(dir, "nope"), PATH: join(dir, "empty-path") },
    })
    expect(result.available).toBe(false)
    if (!result.available) {
      expect(result.message).toContain("not found")
      expect(result.installHint).toContain("RESEARCHOS_TECTONIC")
    }
  })

  test("compile rejects files outside the project root", async () => {
    await expect(compile({ projectRoot: dir, mainFile: "../outside.tex" })).rejects.toThrow(/escapes project root/)
  })

  test("compile rejects a missing main file", async () => {
    await expect(compile({ projectRoot: dir, mainFile: "missing.tex" })).rejects.toThrow(/not found/)
  })
})

describe("real tectonic smoke", () => {
  test("compiles a hello-world document when tectonic is on PATH", async () => {
    const binary = locateTectonic(".")
    if (!binary) {
      console.warn("tectonic not installed; skipping real compile smoke")
      return
    }
    const dir = await mkdtemp(join(tmpdir(), "latex-smoke-"))
    await writeFile(join(dir, "main.tex"), [
      "\\documentclass{article}",
      "\\begin{document}",
      "Hello, ResearchOS.",
      "\\end{document}",
      "",
    ].join("\n"))
    const result = await compile({ projectRoot: dir, mainFile: "main.tex" })
    expect(result.available).toBe(true)
    if (result.available) {
      expect(result.ok).toBe(true)
      expect(result.pdfPath).toBeDefined()
    }
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }, { timeout: 180_000 })
})
