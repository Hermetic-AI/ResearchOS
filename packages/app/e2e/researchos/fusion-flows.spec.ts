// Fusion acceptance flows: literature -> AgentDock -> related chats, and
// literature -> "Open in graph" deep link (miss banner; hit path blocked, see flow B).
import { expect, test, type Page } from "@playwright/test"
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { makePdf } from "../../../researchos-literature/test/fixtures/pdf"

let directory = ""

// Written for the 1.x route model (`/${dir}/literature`, unauthenticated `/path`). 2.0 serves
// `/server/:key/researchos/:dir/:module` against a password-protected `/api`, so nothing here matches.
// Kept as the porting checklist for the literature-import, dock and graph flows; see
// workspace-routes.spec.ts for the 2.0 pattern (seeded server password + moduleHref helper).
test.describe.skip("fusion: ResearchOS literature x dock x graph", () => {
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

  test("flow A: select paper -> dock question -> related chats", async ({ page }) => {
    await page.goto(`/${base64Encode(directory)}/literature`)
    await expect(page.getByText("Literature library")).toBeVisible()

    // Import a real PDF through the UI; the import auto-selects the paper in the detail pane.
    await page.locator('input[type="file"]').setInputFiles({
      name: "attention.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(makePdf([
        ["Attention Is All You Need", "Ashish Vaswani, Noam Shazeer", "arXiv:1706.03762v5", "2017"],
        ["References", "[1] Dzmitry Bahdanau. Neural machine translation. In ICLR, 2015."],
      ])),
    })
    await page.getByRole("button", { name: "Import PDF", exact: true }).click()
    await expect(page.getByText("Imported 1 paper")).toBeVisible({ timeout: 60_000 })
    await expect(page.locator("main h1", { hasText: "Attention Is All You Need" })).toBeVisible()

    // Expand the AgentDock and send a question about the selected paper.
    await page.getByRole("button", { name: "Expand agent dock" }).first().click()
    const question = "What problem does the Transformer solve?"
    await page.getByPlaceholder(/Ask an agent about/).fill(question)
    await page.getByRole("button", { name: "Send", exact: true }).click()

    // No LLM provider is configured in e2e. What must be real regardless: a companion
    // session is created and the user message lands in the dock transcript.
    await expect(page.getByText("Companion chat")).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(question, { exact: true })).toBeVisible({ timeout: 30_000 })

    // The transcript survives a collapse/expand cycle (session id persisted in localStorage,
    // messages re-polled from the server).
    await page.getByRole("button", { name: "Collapse agent dock" }).first().click()
    await expect(page.getByText(question, { exact: true })).toHaveCount(0)
    await page.getByRole("button", { name: "Expand agent dock" }).first().click()
    await expect(page.getByText(question, { exact: true })).toBeVisible({ timeout: 30_000 })

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
    await page.getByRole("button", { name: /ResearchOS · literature/ }).first().click()
    await expect(page).toHaveURL(/\/session\/[^/]+$/)
  })

  test("flow B: open in graph deep link (miss banner + linked-node hit)", async ({ page }) => {
    // Build the graph first; the graph smoke note proves indexing ran.
    await page.goto(`/${base64Encode(directory)}/graph`)
    await page.getByRole("button", { name: "Build graph" }).first().click()
    await expect(page.getByText("Graph smoke note", { exact: true })).toBeVisible({ timeout: 60_000 })

    // Miss path (deterministic): a paper id with no linked node shows the banner,
    // which explains the situation and offers to build the graph.
    await page.goto(`/${base64Encode(directory)}/graph?paper=definitely-not-a-paper`)
    const banner = page.getByText(/No graph node is linked to paper/)
    await expect(banner).toBeVisible({ timeout: 30_000 })
    await expect(banner.locator("..").getByRole("button", { name: "Build graph" })).toBeVisible()

    // Hit path: the imported paper has a graph node (literature papers enter the graph
    // with their citation edges at reindex), so the deep link selects it and the drawer
    // shows its Literature record.
    await moduleButton(page, "Literature").click()
    await page.getByRole("button", { name: /Attention Is All You Need/ }).first().click()
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

// Research modules switch through icon buttons in the native rail (no nav landmark).
function moduleButton(page: Page, label: string) {
  return page.getByRole("button", { name: label, exact: true }).first()
}

function base64Encode(value: string) {
  return Buffer.from(value).toString("base64url")
}
