import { loadConfig } from "@researchos/core-config"
import { createApp, ensureProject, handleRequest, openDb } from "./index"

const args = process.argv.slice(2)
function flagValue(name: string, fallback: string): string {
  const index = args.indexOf(name)
  const value = index >= 0 ? args[index + 1] : undefined
  return value ?? fallback
}

const config = loadConfig(args.includes("--config") ? flagValue("--config", "") : undefined)
const db = openDb(config)
const project = ensureProject(db, process.cwd())
const app = createApp({ config, db, project })

const port = Number(flagValue("--port", "7377"))
Bun.serve({
  port,
  async fetch(request) {
    try {
      return await handleRequest(app, request)
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 })
    }
  },
})

console.log(`ResearchOS server on http://localhost:${port} (provider=${app.providerName}, model=${app.model}, db=${config.home})`)
