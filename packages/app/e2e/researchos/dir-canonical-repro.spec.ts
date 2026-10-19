import { expect, test } from "@playwright/test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

// Repro for the Windows 8.3 short-path remount bug: the server canonicalizes
// C:\Users\MINGW~1\... to the long form asynchronously; if routed content mounts
// under the short form first, the later redirect remounts the subtree and kills
// in-flight work (observed as a hanging literature import refetch).
let directory = ""

// The 1.x canonicalization redirect this guarded lived in app.tsx/entry.tsx (`/${dir}/...` remount on a
// short-path resolve). 2.0 builds researchos hrefs from the server-resolved directory, so there is no
// redirect to race; re-open this only if a 2.0 canonicalization step is added.
test.describe.skip("repro: 8.3 directory canonicalization", () => {
  test.beforeAll(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "researchos-short-"))
  })

  test.afterAll(async () => {
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => undefined)
  })

  test("routed content must not mount before the directory is canonical", async ({ page, request }) => {
    const info = await request.get("http://127.0.0.1:14096/path", { params: { directory } })
    const canonical = ((await info.json()) as { directory: string }).directory
    // Premise: the server expands the 8.3 short form, so a redirect must happen.
    expect(canonical).not.toBe(directory)

    // Hold the directory-scoped /path response for 3s so the canonical directory
    // arrives well after page load, making the mount order deterministic.
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    setTimeout(() => release(), 3000)
    await page.route("**/path", async (route, req) => {
      if (req.headers()["x-opencode-directory"]) await gate
      await route.continue()
    })

    const slug = base64Encode(directory)
    const canonicalSlug = base64Encode(canonical)
    const heading = page.getByRole("heading", { name: "Skills", exact: true })
    await page.goto(`/${slug}/assets`)

    const contentBeforeRedirect = await Promise.race([
      page.waitForURL((url) => url.pathname.includes(`/${canonicalSlug}/`)).then(() => false),
      heading.waitFor({ state: "visible" }).then(() => true),
    ])
    expect(contentBeforeRedirect).toBe(false)

    await expect(heading).toBeVisible()
    expect(page.url()).toContain(`/${canonicalSlug}/`)
  })
})

function base64Encode(value: string) {
  return Buffer.from(value).toString("base64url")
}
