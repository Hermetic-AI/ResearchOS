import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, posix } from "node:path"

const root = process.argv[2]
const listFile = process.argv[3]
const files = readFileSync(listFile, "utf8").split("\n").filter(Boolean)

const nameToDir = new Map()
for (const top of ["packages", "ros", "sdks", "services"]) {
  const base = join(root, top)
  if (!existsSync(base)) continue
  for (const e of readdirSync(base)) {
    const pj = join(base, e, "package.json")
    if (!existsSync(pj)) continue
    try {
      const json = JSON.parse(readFileSync(pj, "utf8"))
      if (json.name) nameToDir.set(json.name, `${top}/${e}`)
    } catch {}
  }
}

const tree = new Set()
const walk = (dir, rel) => {
  let entries = []
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const e of entries) {
    if (e === "node_modules" || e === ".git" || e === "dist") continue
    const p = join(dir, e)
    const r = rel ? `${rel}/${e}` : e
    let st
    try {
      st = statSync(p)
    } catch {
      continue
    }
    if (st.isDirectory()) walk(p, r)
    else tree.add(r)
  }
}
walk(root, "")

const exts = ["", ".ts", ".tsx", ".mts", ".js", ".jsx", "/index.ts", "/index.tsx", "/src/index.ts", "/src/index.tsx", ".d.ts"]
const hit = (base) => {
  for (const x of exts) if (tree.has(base + x)) return true
  return false
}

const importRe = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g
const report = new Map()
const add = (key, val) => {
  if (!report.has(key)) report.set(key, new Set())
  report.get(key).add(val)
}

let total = 0
for (const f of files) {
  if (!/\.(ts|tsx)$/.test(f)) continue
  const src = readFileSync(join(root, f), "utf8")
  const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : ""
  let m
  while ((m = importRe.exec(src))) {
    const spec = m[1]
    if (spec.startsWith(".")) {
      const target = posix.normalize(posix.join(dir, spec))
      if (!hit(target)) add("RELATIVE_MOVED", `${spec}  <- ${f}`)
      continue
    }
    if (spec.startsWith("@/")) {
      const dirRoot = f.split("/").slice(0, 2).join("/")
      const target = `${dirRoot}/src/${spec.slice(2)}`
      if (!hit(target)) add("APP_ALIAS_MOVED", `${spec}  <- ${f}`)
      continue
    }
    if (!spec.startsWith("@") && !spec.startsWith("opencode")) continue
    total++
    const parts = spec.split("/")
    const pkg = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
    const sub = spec.slice(pkg.length).replace(/^\//, "")
    const check = (name) => {
      const d = nameToDir.get(name)
      if (!d) return "PKG_MISSING"
      if (!sub) return hit(`${d}/src/index`) ? "OK" : "ENTRY_MISSING"
      return hit(`${d}/src/${sub}`) || hit(`${d}/${sub}`) ? "OK" : "SUBPATH_MISSING"
    }
    const direct = check(pkg)
    const alias = pkg.startsWith("@opencode-ai/") ? "@opencode/" + pkg.slice("@opencode-ai/".length) : null
    const viaAlias = alias ? check(alias) : null
    let status, note = ""
    if (direct === "OK") status = "OK"
    else if (viaAlias === "OK") {
      status = "SCOPE_RENAME"
      note = `  ->  ${alias}${sub ? "/" + sub : ""}`
    } else status = viaAlias && viaAlias !== "PKG_MISSING" ? viaAlias : direct === "PKG_MISSING" && viaAlias === "PKG_MISSING" ? "PKG_MISSING" : direct
    if (status === "OK") continue
    add(status, `${spec}${note}  <- ${f}`)
  }
}

const order = ["SCOPE_RENAME", "SUBPATH_MISSING", "PKG_MISSING", "ENTRY_MISSING", "RELATIVE_MOVED"]
console.log(`workspace-scoped imports seen: ${total}`)
for (const k of order) {
  const v = report.get(k)
  if (!v) continue
  console.log(`\n### ${k}: ${v.size}`)
  for (const line of [...v].sort()) console.log("  " + line)
}
