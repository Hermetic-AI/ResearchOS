import { resolve } from "path"
import { RunPythonOutput } from "./contract"

export class KernelClient {
  private process: ReturnType<typeof spawnKernel> | undefined
  private reader: ReturnType<typeof createReader> | undefined
  private buffer = ""
  private queue = Promise.resolve()

  constructor(private projectRoot: string) {}

  execute(input: { code: string; workdir?: string; timeoutS?: number; cellId?: string }) {
    const result = this.queue.then(() => this.send(input))
    this.queue = result.then(() => undefined, () => undefined)
    return result
  }

  close() {
    this.process?.kill()
    this.process = undefined
    this.reader = undefined
    this.buffer = ""
  }

  async shutdown() {
    const process = this.ensureProcess()
    process.stdin.write(`${JSON.stringify({ operation: "shutdown", payload: {} })}\n`)
    const response = JSON.parse(await this.readLine()) as { ok: boolean; error?: string }
    if (!response.ok) throw new Error(response.error ?? "data kernel shutdown failed")
  }

  private async send(input: { code: string; workdir?: string; timeoutS?: number; cellId?: string }) {
    const process = this.ensureProcess()
    process.stdin.write(`${JSON.stringify({
      operation: "run",
      payload: {
        code: input.code,
        workdir: input.workdir ?? ".",
        timeout_s: input.timeoutS ?? 120,
        ...(input.cellId ? { cell_id: input.cellId } : {}),
      },
    })}\n`)
    const response = JSON.parse(await this.readLine()) as { ok: boolean; result?: unknown; error?: string }
    if (!response.ok) throw new Error(response.error ?? "data kernel bridge failed")
    return RunPythonOutput.parse(response.result)
  }

  private ensureProcess() {
    if (this.process && this.process.exitCode === null) return this.process
    this.process = spawnKernel(this.projectRoot)
    this.reader = createReader(this.process)
    void new Response(this.process.stderr).text()
    return this.process
  }

  private async readLine(): Promise<string> {
    const newline = this.buffer.indexOf("\n")
    if (newline >= 0) {
      const line = this.buffer.slice(0, newline)
      this.buffer = this.buffer.slice(newline + 1)
      return line
    }
    const chunk = await this.reader?.read()
    if (!chunk || chunk.done) throw new Error("data kernel bridge exited without a response")
    this.buffer += new TextDecoder().decode(chunk.value, { stream: true })
    return this.readLine()
  }
}

function spawnKernel(projectRoot: string) {
  return Bun.spawn(
    ["uv", "run", "--directory", resolve(import.meta.dir, "../../researchos-mcp/data"), "researchos-data-bridge"],
    {
      cwd: projectRoot,
      env: { ...process.env, RESEARCHOS_PROJECT_ROOT: projectRoot },
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    },
  )
}

function createReader(process: ReturnType<typeof spawnKernel>) {
  return process.stdout.getReader()
}
