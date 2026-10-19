const password = process.env.OPENCODE_PASSWORD ?? "researchos-dev"
const serverUrl = "http://127.0.0.1:14096/api/info"
const appUrl = "http://127.0.0.1:3000"

const serverRunning = await responds(serverUrl)
const appRunning = await responds(appUrl)

if (serverRunning && appRunning) {
  console.log("ResearchOS is already running.")
  console.log(`Web: ${appUrl}`)
  console.log(`Server: ${serverUrl}`)
  process.exit(0)
}

const processes: Bun.Subprocess[] = []

if (!serverRunning) {
  await requireAvailablePort(14096)
  processes.push(
    Bun.spawn({
      cmd: [process.execPath, "run", "--cwd", "packages/cli", "src/index.ts", "serve", "--port", "14096"],
      stdout: "inherit",
      stderr: "inherit",
      env: { ...process.env, OPENCODE_PASSWORD: password },
    }),
  )
  await waitFor(serverUrl, "OpenCode server")
}

if (!appRunning) {
  await requireAvailablePort(3000)
  processes.push(
    Bun.spawn({
      cmd: [
        process.execPath,
        "run",
        "--cwd",
        "packages/app",
        "dev",
        "--host",
        "127.0.0.1",
        "--port",
        "3000",
        "--strictPort",
      ],
      stdout: "inherit",
      stderr: "inherit",
      env: {
        ...process.env,
        OPENCODE_PASSWORD: password,
        VITE_OPENCODE_SERVER_HOST: "127.0.0.1",
        VITE_OPENCODE_SERVER_PORT: "14096",
      },
    }),
  )
  await waitFor(appUrl, "ResearchOS web app")
}

console.log("ResearchOS is ready.")
console.log(`Web: ${appUrl}`)
console.log("Server: http://127.0.0.1:14096")
console.log("Press Ctrl+C to stop the processes started by this command.")

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    processes.forEach((process) => process.kill())
    process.exit(0)
  })
}

await Promise.race(processes.map((process) => process.exited))
processes.forEach((process) => process.kill())
process.exit(1)

async function responds(url: string) {
  try {
    const headers = { Authorization: `Basic ${btoa(`opencode:${password}`)}` }
    return (await fetch(url, { headers, signal: AbortSignal.timeout(1_000) })).ok
  } catch {
    return false
  }
}

async function requireAvailablePort(port: number) {
  try {
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port,
      fetch: () => new Response(),
    })
    server.stop(true)
  } catch {
    throw new Error(`Port ${port} is already in use. Stop the process using it, then run bun run researchos:dev again.`)
  }
}

async function waitFor(url: string, name: string) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await responds(url)) return
    await Bun.sleep(500)
  }
  throw new Error(`${name} did not become ready within 30 seconds. Run bun run researchos:doctor for diagnostics.`)
}
