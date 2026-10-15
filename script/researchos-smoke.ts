import path from "path"

const chrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
const executablePath = process.platform === "win32" && await Bun.file(chrome).exists() ? chrome : undefined
const serverUrl = "http://127.0.0.1:14096/global/health"
const server = await responds(serverUrl)
  ? undefined
  : Bun.spawn({
      cmd: [process.execPath, "run", "--cwd", "packages/opencode", "src/index.ts", "serve", "--port", "14096"],
      cwd: path.join(import.meta.dir, ".."),
      stdout: "inherit",
      stderr: "inherit",
    })

if (server) await waitForServer()

const result = Bun.spawn({
  cmd: [process.execPath, "x", "playwright", "test", "e2e/researchos/workspace-smoke.spec.ts"],
  cwd: path.join(import.meta.dir, "..", "packages", "app"),
  stdout: "inherit",
  stderr: "inherit",
  env: {
    ...process.env,
    PLAYWRIGHT_DISABLE_VIDEO: "1",
    ...(executablePath ? { PLAYWRIGHT_EXECUTABLE_PATH: executablePath } : {}),
  },
})

const exitCode = await result.exited
server?.kill()
process.exit(exitCode)

async function responds(url: string) {
  try {
    return (await fetch(url, { signal: AbortSignal.timeout(1_000) })).ok
  } catch {
    return false
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await responds(serverUrl)) return
    await Bun.sleep(500)
  }
  server?.kill()
  throw new Error("OpenCode server did not become ready within 30 seconds.")
}
