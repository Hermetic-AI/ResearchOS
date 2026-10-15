const checks = await Promise.all([
  commandCheck("Bun", [process.execPath, "--version"], true),
  commandCheck("uv (data analysis)", ["uv", "--version"], false),
  commandCheck("Tectonic (LaTeX PDF compilation)", ["tectonic", "--version"], false),
  httpCheck("OpenCode server", "http://127.0.0.1:14096/global/health"),
  httpCheck("ResearchOS web app", "http://127.0.0.1:3000"),
])

console.log("ResearchOS diagnostics")
checks.forEach((check) => console.log(`${check.ok ? "OK" : "MISSING"}  ${check.name}${check.detail ? ` — ${check.detail}` : ""}`))
console.log(`INFO  LibreTranslate — ${process.env.LIBRETRANSLATE_URL ? "configured" : "set LIBRETRANSLATE_URL to enable translation"}`)
console.log(`INFO  Semantic Scholar — ${process.env.S2_API_KEY ? "configured" : "optional S2_API_KEY is not set"}`)
console.log(`INFO  PubMed — ${process.env.NCBI_API_KEY ? "configured" : "optional NCBI_API_KEY is not set"}`)

if (checks.filter((check) => check.required && !check.ok).length) process.exit(1)

async function commandCheck(name: string, cmd: string[], required: boolean) {
  try {
    const result = Bun.spawn({ cmd, stdout: "pipe", stderr: "pipe" })
    const exitCode = await result.exited
    return { name, required, ok: exitCode === 0, detail: exitCode === 0 ? (await new Response(result.stdout).text()).trim() : "not available" }
  } catch {
    return { name, required, ok: false, detail: "not available" }
  }
}

async function httpCheck(name: string, url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1_000) })
    return { name, required: false, ok: response.ok, detail: response.ok ? "reachable" : `HTTP ${response.status}` }
  } catch {
    return { name, required: false, ok: false, detail: "not running" }
  }
}
