import { describe, expect, test } from "bun:test"
import { mkdtempSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import type { Config } from "@researchos/core-config"
import { Db } from "@researchos/core-db"
import { createApp, handleRequest, PERSONAS } from "../src/index"

function tempApp() {
  const directory = mkdtempSync(join(tmpdir(), "ros-lab-"))
  const db = Db.open(join(directory, "test.db"))
  const project = db.createProject("p", directory)
  const config = { home: directory, provider: "mock", maxSteps: 8, providers: { mock: { kind: "mock" } } } as Config
  return { app: createApp({ config, db, project }), db }
}

async function json(app: ReturnType<typeof createApp>, path: string, init?: RequestInit) {
  const response = await handleRequest(app, new Request(`http://x${path}`, init))
  return { status: response.status, body: (await response.json()) as Record<string, unknown> }
}

describe("lab workbench routes", () => {
  test("roster lists personas", async () => {
    const { app } = tempApp()
    const { status, body } = await json(app, "/api/lab/roster")
    const rows = body as unknown as Array<Record<string, unknown>>
    expect(status).toBe(200)
    expect(rows).toHaveLength(PERSONAS.length)
    expect(rows[0]).toContainKeys(["id", "name", "char", "color", "note"])
  })

  test("create job persists persona thread and rejects unknown persona", async () => {
    const { app, db } = tempApp()
    const bad = await json(app, "/api/lab/jobs", { method: "POST", body: JSON.stringify({ persona: "nope", task: "t" }) })
    expect(bad.status).toBe(400)
    const res = await json(app, "/api/lab/jobs", {
      method: "POST",
      body: JSON.stringify({ persona: "lit", title: "核对低秩结论", task: "核对文献库中低秩相关论文的结论" }),
    })
    const thread = res.body.thread as { id: string; persona: string }
    expect(res.status).toBe(200)
    expect(thread.persona).toBe("lit")
    expect(app.db.listThreads(app.project.id).filter((t) => t.persona !== null)).toHaveLength(1)
    expect(db.listTrace(app.project.id).some((t) => t.kind === "job" && t.summary.includes("派单 · 文献研究员"))).toBe(true)
  })

  test("job runs through the SSE message route with the mock literature branch", async () => {
    const { app } = tempApp()
    const created = await handleRequest(
      app,
      new Request("http://x/api/lab/jobs", {
        method: "POST",
        body: JSON.stringify({ persona: "lit", task: "查文献：transformer" }),
      }),
    ).then((r) => r.json() as Promise<{ thread: { id: string } }>)
    const stream = await handleRequest(
      app,
      new Request(`http://x/api/threads/${created.thread.id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content: "查文献：transformer" }),
      }),
    )
    const text = await stream.text()
    expect(text).toContain('"type":"tool_call"')
    expect(text).toContain("literature_search")
    expect(text).toContain('"type":"done"')
    const roles = app.db.listMessages(created.thread.id).map((row) => row.role)
    expect(roles).toEqual(["user", "assistant", "tool", "assistant"])
  })
})
