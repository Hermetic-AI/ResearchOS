import { expect, test } from "@playwright/test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { base64Encode } from "@opencode/util/encode"
import { SERVER, seed } from "../utils/app"

// Unlike the mocked suite this drives a real server: start it with `bun run researchos:dev`, then run
// Playwright with PLAYWRIGHT_SERVER_HOST=127.0.0.1 PLAYWRIGHT_SERVER_PORT=14096 so SERVER matches it.
const password = process.env.RESEARCHOS_E2E_PASSWORD ?? "researchos-dev"

function moduleHref(directory: string, module: string) {
  return `/server/${base64Encode(SERVER)}/researchos/${base64Encode(directory)}/${module}`
}

test.describe("ResearchOS workspace routes", () => {
  let directory = ""

  test.beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "researchos-routes-"))
  })

  test.afterAll(async () => {
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => undefined)
  })

  test("seeds the preset and navigates overview, literature and notes", async ({ page }) => {
    const pageErrors: Error[] = []
    page.on("pageerror", (error) => pageErrors.push(error))
    await seed(page, {
      locale: "en",
      storage: {
        "opencode.global.dat:server": {
          list: [{ type: "http", displayName: "ResearchOS", http: { url: SERVER, password } }],
        },
      },
    })

    await page.goto(moduleHref(directory, "overview"))
    await expect(page.getByRole("heading", { name: "Project cockpit" })).toBeVisible()
    await expect(page.getByText("unavailable modules are reported honestly")).toBeVisible()
    // The workspace effect installs the preset (agents, commands, skills) before the modules can work.
    await expect
      .poll(async () => readFile(path.join(directory, ".opencode", "agent", "literature.md"), "utf8").catch(() => ""))
      .toContain("---")

    await page.goto(moduleHref(directory, "literature"))
    await expect(page.getByText("Literature library")).toBeVisible()
    await expect(page.getByRole("button", { name: "Import PDF" })).toBeVisible()

    await page.getByRole("button", { name: "ResearchOS modules" }).click()
    await page.getByRole("menuitem", { name: /Quick Notes/ }).click()
    await expect(page).toHaveURL(/\/researchos\/[^/]+\/notes$/)
    await expect(page.getByRole("heading", { name: "Quick notes" })).toBeVisible()

    expect(pageErrors).toEqual([])
  })
})
