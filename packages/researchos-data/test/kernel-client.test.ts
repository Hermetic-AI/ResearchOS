import { afterEach, describe, expect, test } from "bun:test"
import { mkdtemp, rm } from "fs/promises"
import { join } from "path"
import { tmpdir } from "os"
import { KernelClient } from "../src/kernel-client"

const clients: KernelClient[] = []
const roots: string[] = []

afterEach(async () => {
  clients.splice(0).forEach((client) => client.close())
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }).catch(() => {})))
})

describe("KernelClient", () => {
  test("keeps one shared Python namespace across notebook cells", async () => {
    const root = await mkdtemp(join(tmpdir(), "data-kernel-client-"))
    roots.push(root)
    const client = new KernelClient(root)
    clients.push(client)
    expect((await client.execute({ code: "answer = 40" })).error).toBeUndefined()
    const result = await client.execute({ code: "answer += 2\nprint(answer)" })
    expect(result.stdout).toBe("42\n")
    expect(result.error).toBeUndefined()
    await client.shutdown()
  }, 30_000)
})
