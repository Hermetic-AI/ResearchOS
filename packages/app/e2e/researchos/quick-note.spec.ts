// ResearchOS "Save as quick note": the session-ui assistant action and the composer-region
// handler that persists the reply under notes/quick/ via the researchos-assets API.
import { expect, test } from "@playwright/test"
import type { SessionMessageInfo } from "@opencode/client/promise"
import { openSession } from "../utils/workspace"

const messages = [
  { id: "msg_qn_user", type: "user", text: "What is RAG?", time: { created: 1 } },
  {
    id: "msg_qn_reply",
    type: "assistant",
    agent: "literature",
    model: { id: "test", providerID: "opencode" },
    content: [{ type: "text", text: "Retrieval-augmented generation grounds answers in project documents." }],
    time: { created: 2, completed: 3 },
  },
] satisfies SessionMessageInfo[]

test("assistant reply offers Save as quick note and posts the note text", async ({ page }) => {
  const writes: { path?: string; content?: string }[] = []
  await openSession(page, {
    name: "ResearchosQuickNote",
    pageMessages: () => ({ items: messages }),
    onNoteWrite: (input) => writes.push(input),
  })

  const part = page.locator('[data-timeline-part-id="msg_qn_reply:text:0"]')
  const button = part
    .locator('[data-slot="text-part-copy-wrapper"]')
    .getByRole("button", { name: "Save as quick note" })
  await expect(button).toBeVisible()

  // Response actions fade in on row hover; hover keeps the button hittable for the click.
  await part.hover()
  await button.click()

  await expect.poll(() => writes.length).toBe(1)
  expect(writes[0]?.path).toMatch(/^notes\/quick\/\d{4}-\d{2}-\d{2}-/)
  expect(writes[0]?.content).toContain("Retrieval-augmented generation")
  await expect(page.getByText("Saved as quick note")).toBeVisible()
})
