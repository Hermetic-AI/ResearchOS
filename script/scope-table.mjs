import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join } from "node:path"

const root = "."
const files = readFileSync("Acopy.txt", "utf8").split("\n").filter(Boolean)

const nameToDir = new Map()
for (const top of ["packages", "ros", "sdks", "services"]) {
  const base = join(root, top)
  if (!existsSync(base)) continue
  for (const e of readdirSync(base)) {
    const pj = join(base, e, "package.json")
    if (!existsSync(pj)) continue
    try {
      const n = JSON.parse(readFileSync(pj, "utf8")).name
      if (n) nameToDir.set(n, `${top}/${e}`)
    } catch {}
  }
}

const pkgRefs = new Map()
const importRe = /(?:from|import)\s*\(?\s*["'](@opencode-ai\/[^"']+)["']/g
for (const f of files) {
  if (!/\.(ts|tsx)$/.test(f)) continue
  if (!existsSync(join(root, f))) continue
  let m
  const src = readFileSync(join(root, f), "utf8")
  while ((m = importRe.exec(src))) {
    const spec = m[1]
    const pkg = spec.split("/").slice(0, 2).join("/")
    if (!pkgRefs.has(pkg)) pkgRefs.set(pkg, new Set())
    pkgRefs.get(pkg).add(f)
  }
}

const rows = []
for (const [pkg, fs_] of [...pkgRefs].sort()) {
  const alias = "@opencode/" + pkg.slice("@opencode-ai/".length)
  rows.push({ old: pkg, new: alias, existsIn20: nameToDir.has(alias) ? "YES" : "NO", files: fs_.size })
}
const width = Math.max(...rows.map((r) => r.old.length))
for (const r of rows) console.log(`${r.old.padEnd(width)}  ->  ${(r.new || "").padEnd(width - 4)}  pkg@2.0:${r.existsIn20.padEnd(4)} used_by_files:${r.files}`)
console.log(`\ntotal distinct @opencode-ai/* packages imported by our code: ${rows.length}`)
console.log(`present under @opencode/* in 2.0: ${rows.filter((r) => r.existsIn20 === "YES").length}`)
console.log(`ABSENT in 2.0: ${rows.filter((r) => r.existsIn20 === "NO").map((r) => r.old).join(", ")}`)

// also count dependency declarations in our package.json files
let deps = 0
const depPkgs = new Set()
for (const f of files.filter((x) => x.endsWith("package.json"))) {
  try {
    const j = JSON.parse(readFileSync(join(root, f), "utf8"))
    for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
      for (const k of Object.keys(j[field] || {})) {
        if (k.startsWith("@opencode-ai/")) {
          deps++
          depPkgs.add(k)
        }
      }
    }
  } catch {}
}
console.log(`package.json deps on @opencode-ai/*: ${deps} across ${depPkgs.size} distinct names: ${[...depPkgs].join(", ")}`)
