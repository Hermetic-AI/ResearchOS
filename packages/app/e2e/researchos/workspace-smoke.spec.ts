import { expect, test } from "@playwright/test"
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { makePdf } from "../../../researchos-literature/test/fixtures/pdf"

let directory = ""

// 1.x route shape (`/${dir}/assets`) and 1.x asset-page labels; superseded by workspace-routes.spec.ts
// for navigation. Kept as the porting checklist for the skill/agent/command/rules CRUD, PDF import and
// graph-build steps, which no 2.0 spec covers yet.
test.describe.skip("smoke: ResearchOS workspace", () => {
  test.beforeAll(async () => {
    // realpath: on Windows os.tmpdir() may return an 8.3 short path; the app re-resolves
    // the directory to the long form and mismatched casing/length hangs the import refetch.
    directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "researchos-smoke-")))
  })

  test.afterAll(async () => {
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => undefined)
  })

  test("loads asset data and navigates to the literature import workflow", async ({ page }) => {
    // PDF import + graph build each allow up to 60s; the default 60s test budget is too small.
    test.setTimeout(180_000)
    const pageErrors: Error[] = []
    page.on("pageerror", (error) => pageErrors.push(error))
    await writeFile(path.join(directory, "graph-note.md"), "# Graph smoke note\n\n[[Research concept]]")

    await page.goto(`/${base64Encode(directory)}/assets`)
    // Module navigation lives in the native sidebar icon rail (aria-label per module).
    await expect(page.getByRole("button", { name: "Literature" }).first()).toBeVisible()
    await expect(page.getByRole("heading", { name: "Skills", exact: true })).toBeVisible()
    await expect(page.getByText("Assets could not be loaded")).toHaveCount(0)
    await page.getByRole("button", { name: "+ New skill" }).click()
    await page.getByLabel("Name").fill("researchos-smoke-skill")
    await page.getByLabel("File content (with frontmatter)").fill("---\ndescription: Smoke-test skill\n---\n\n# Smoke skill")
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect.poll(async () => readFile(path.join(directory, ".opencode", "skill", "researchos-smoke-skill", "SKILL.md"), "utf8").catch(() => ""))
      .toContain("Smoke-test skill")
    await page.getByRole("button", { name: "Refresh", exact: true }).click()
    await expect(page.getByText("researchos-smoke-skill", { exact: true })).toBeVisible()

    const assets = page.getByRole("navigation", { name: "Asset types" })
    await assets.getByRole("button", { name: /SubAgents/ }).click()
    await page.getByRole("button", { name: "+ New agent" }).click()
    await page.getByLabel("Name").fill("researchos-smoke-agent")
    await page.getByLabel("File content (with frontmatter)").fill("---\ndescription: Smoke-test agent\nmode: subagent\n---\n\nYou are a smoke-test agent.")
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect(page.getByText("researchos-smoke-agent", { exact: true })).toBeVisible()

    await assets.getByRole("button", { name: /Commands/ }).click()
    await page.getByRole("button", { name: "+ New command" }).click()
    await page.getByLabel("Name").fill("researchos-smoke-command")
    await page.getByLabel("File content (with frontmatter)").fill("---\ndescription: Smoke-test command\n---\n\nRun the smoke test.")
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect(page.getByText("/researchos-smoke-command", { exact: true })).toBeVisible()

    await assets.getByRole("button", { name: /Rules/ }).click()
    await page.getByRole("button", { name: "Edit rules" }).click()
    await page.getByLabel("AGENTS.md content").fill("# Smoke-test project rules\n\nUse the project conventions.")
    await page.getByRole("button", { name: "Save", exact: true }).click()
    await expect.poll(async () => readFile(path.join(directory, "AGENTS.md"), "utf8").catch(() => ""))
      .toContain("Smoke-test project rules")
    await page.getByRole("button", { name: "Refresh", exact: true }).click()
    await expect(page.getByText(/Smoke-test project rules/)).toBeVisible()

    await page.getByRole("button", { name: "Literature" }).first().click()
    await expect(page.getByText("Literature library")).toBeVisible()
    await expect(page.getByText("Import PDF")).toBeVisible()
    await page.locator('input[type="file"]').setInputFiles({
      name: "attention.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(makePdf([
        ["Attention Is All You Need", "Ashish Vaswani, Noam Shazeer", "arXiv:1706.03762v5", "2017"],
        ["References", "[1] Dzmitry Bahdanau. Neural machine translation. In ICLR, 2015."],
      ])),
    })
    await page.getByRole("button", { name: "Import PDF", exact: true }).click()
    await expect(page.getByText(/Imported 1 paper/)).toBeVisible({ timeout: 60_000 })
    await expect(page.locator("main h1", { hasText: "Attention Is All You Need" })).toBeVisible()
    await page.getByRole("button", { name: "Export", exact: true }).click()
    await expect(page.getByText(/@\w+\{/)).toBeVisible()
    await page.getByRole("button", { name: "Knowledge Graph" }).first().click()
    await page.getByRole("button", { name: "Build graph" }).first().click()
    await expect(page.getByText("Graph smoke note", { exact: true })).toBeVisible({ timeout: 60_000 })
    expect(pageErrors).toEqual([])
  })
})

function base64Encode(value: string) {
  return Buffer.from(value).toString("base64url")
}
