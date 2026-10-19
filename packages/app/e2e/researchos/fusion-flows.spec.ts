// Fusion acceptance flows on the 2.0 route model: literature -> AgentDock -> related chats,
// and literature -> "Open in graph" deep link (miss banner + linked-node hit).
// Requires the live stack: `bun run researchos:dev`, then run Playwright with
// PLAYWRIGHT_SERVER_HOST=127.0.0.1 PLAYWRIGHT_SERVER_PORT=14096 so SERVER matches the server.
import { expect, test } from "@playwright/test"
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { base64Encode } from "@opencode/util/encode"
import { SERVER, seed } from "../utils/app"
import { makePdf } from "../../../researchos-literature/test/fixtures/pdf"

const password = process.env.RESEARCHOS_E2E_PASSWORD ?? "researchos-dev"
let directory = ""

function moduleHref(module: string) {
  return `/server/${base64Encode(SERVER)}/researchos/${base64Encode(directory)}/${module}`
}

test.describe("fusion: ResearchOS literature x dock x graph", () => {
  test.describe.configure({ mode: "serial" })

  test.beforeAll(async () => {
    // realpath: os.tmpdir() may return a Windows 8.3 short path (e.g. MINGTI~1);
    // the app re-resolves it to the long form mid-flight and the import flow hangs.
    directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "researchos-fusion-")))
    await writeFile(path.join(directory, "graph-note.md"), "# Graph smoke note\n\n[[Research concept]]")
  })

  test.afterAll(async () => {
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => undefined)
  })

  test.beforeEach(async ({ page }) => {
    await seed(page, {
      locale: "en",
      storage: {
        "opencode.global.dat:server": {
          list: [{ type: "http", displayName: "ResearchOS", http: { url: SERVER, password } }],
        },
      },
    })
  })

  test("flow A: select paper -> dock question -> related chats", async ({ page }) => {
    await page.goto(moduleHref("literature"))
    await expect(page.getByText("Literature library")).toBeVisible()

    // Import a real PDF through the UI; the import auto-selects the paper in the detail pane.
    await page.locator('input[type="file"]').setInputFiles({
      name: "attention.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(
        makePdf([
          ["Attention Is All You Need", "Ashish Vaswani, Noam Shazeer", "arXiv:1706.03762v5", "2017"],
          ["References", "[1] Dzmitry Bahdanau. Neural machine translation. In ICLR, 2015."],
        ]),
      ),
    })
    await page.getByRole("button", { name: "Import PDF", exact: true }).click()
    await expect(page.getByText("Imported 1 paper")).toBeVisible({ timeout: 60_000 })
    await expect(page.locator("main h1", { hasText: "Attention Is All You Need" })).toBeVisible()

    // Expand the AgentDock and send a question about the selected paper.
    await page.getByRole("button", { name: "Expand agent dock" }).first().click()
    const question = "What problem does the Transformer solve?"
    await page.getByPlaceholder(/Ask an agent about/).fill(question)
    await page.getByRole("button", { name: "Send", exact: true }).click()

    // No working LLM provider is configured in e2e. What must be real regardless: a companion
    // session is created and the question lands in the dock transcript. With paper context the
    // 2.0 dock prepends the paper dossier to the prompt body (no per-request system field), so
    // match the question as a substring of the message rather than the exact node text.
    await expect(page.getByText("Companion chat")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(question)).toBeVisible({ timeout: 30_000 })

    // The transcript survives a collapse/expand cycle (session id persisted in localStorage,
    // messages re-polled from the server).
    await page.getByRole("button", { name: "Collapse agent dock" }).first().click()
    await expect(page.getByText(question)).toHaveCount(0)
    await page.getByRole("button", { name: "Expand agent dock" }).first().click()
    await expect(page.getByText(question)).toBeVisible({ timeout: 30_000 })

    // The detail pane now links the dock session under "Related chats". The join reads
    // localStorage (non-reactive) merged with the SSE-driven session store; with no
    // provider configured no follow-up session events may arrive, so reload the page
    // for an honest recompute (this also proves the localStorage indexing survives).
    await page.reload()
    await expect(page.getByText("Literature library")).toBeVisible()
    const listItem = page.getByRole("button", { name: /Attention Is All You Need/ }).first()
    await expect(listItem).toBeVisible()
    await listItem.click()
    await expect(page.locator("main h1", { hasText: "Attention Is All You Need" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Related chats" })).toBeVisible({ timeout: 30_000 })
    await page
      .getByRole("button", { name: /ResearchOS · literature/ })
      .first()
      .click()
    await expect(page).toHaveURL(/\/session\/[^/]+$/)
  })

  test("flow B: open in graph deep link (miss banner + linked-node hit)", async ({ page }) => {
    // Build the graph first; the graph smoke note proves indexing ran.
    await page.goto(moduleHref("graph"))
    await page.getByRole("button", { name: "Build graph" }).first().click()
    await expect(page.getByText("Graph smoke note", { exact: true })).toBeVisible({ timeout: 60_000 })

    // Miss path (deterministic): a paper id with no linked node shows the banner,
    // which explains the situation and offers to build the graph.
    await page.goto(moduleHref("graph?paper=definitely-not-a-paper"))
    const banner = page.getByText(/No graph node is linked to paper/)
    await expect(banner).toBeVisible({ timeout: 30_000 })
    await expect(banner.locator("..").getByRole("button", { name: "Build graph" })).toBeVisible()

    // Hit path: the imported paper has a graph node (literature papers enter the graph
    // with their citation edges at reindex), so the deep link selects it and the drawer
    // shows its Literature record. Module switching goes through the titlebar menu: the
    // sidebar module list may be collapsed.
    await page.getByRole("button", { name: "ResearchOS modules" }).click()
    await page.getByRole("menuitem", { name: /^Literature/ }).click()
    await page
      .getByRole("button", { name: /Attention Is All You Need/ })
      .first()
      .click()
    await expect(page.locator("main h1", { hasText: "Attention Is All You Need" })).toBeVisible()
    await page.getByRole("button", { name: "Open in graph", exact: true }).click()
    // The graph page consumes ?paper=<id> (setSearchParams replace) as soon as the deep link
    // is processed, so the observable contract is: navigation to /graph plus the outcome below.
    await expect(page).toHaveURL(/\/graph/)
    await expect(page.getByText("Literature record")).toBeVisible({ timeout: 30_000 })
    const record = page.locator("section", { hasText: "Literature record" })
    await expect(record.getByText("Attention Is All You Need").first()).toBeVisible()
    await expect(page.getByText(/No graph node is linked to paper/)).toHaveCount(0)
  })
})
