import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import path from "path"
import { resolveAssetPath } from "../src/handlers/researchos-assets-path"

describe("ResearchOS asset paths", () => {
  test("resolves every project asset kind inside its documented directory", async () => {
    const root = path.resolve("project")

    expect(await Effect.runPromise(resolveAssetPath({ kind: "skill", name: "paper-reading", scope: "project" }, root, "global")))
      .toBe(path.join(root, ".opencode", "skill", "paper-reading", "SKILL.md"))
    expect(await Effect.runPromise(resolveAssetPath({ kind: "agent", name: "literature", scope: "project" }, root, "global")))
      .toBe(path.join(root, ".opencode", "agent", "literature.md"))
    expect(await Effect.runPromise(resolveAssetPath({ kind: "command", name: "search-papers", scope: "project" }, root, "global")))
      .toBe(path.join(root, ".opencode", "command", "search-papers.md"))
    expect(await Effect.runPromise(resolveAssetPath({ kind: "rules", name: "", scope: "project" }, root, "global")))
      .toBe(path.join(root, "AGENTS.md"))
  })

  test.each(["", "../evil", "a/b", "a\\b", "Uppercase", ".hidden"])("rejects unsafe name %s", async (name) => {
    const result = await Effect.runPromiseExit(
      resolveAssetPath({ kind: "skill", name, scope: "project" }, "project", "global"),
    )
    expect(result._tag).toBe("Failure")
  })
})
