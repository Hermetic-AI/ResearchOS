import { readFileSync, readdirSync, statSync, existsSync } from "node:fs"
import { join, posix } from "node:path"

const root = process.argv[2]
const listFile = process.argv[3]

const files = readFileSync(listFile, "utf8").split("\n").filter(Boolean)

// package name -> directory, from every package.json in the tree
const nameToDir = new Map()
const pkgDirs = []
for (const top of ["packages", "sdks", "ros", "services"]) {
  const base = join(root, top)
  if (!existsSync(base)) continue
  for (const entry of readdirSync(base)) {
    const pj = join(base, entry, "package.json")
    if (!existsSync(pj)) continue
    try {
      const json = JSON.parse(readFileSync(pj, "utf8"))
      if (json.name) {
        nameToDir.set(json.name, `${top}/${entry}`)
        pkgDirs.push(`${top}/${entry}`)
      }
    } catch {}
  }
}

// every file present in the synced tree, so relative imports can be resolved
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

const exts = [".ts", ".tsx", ".mts", ".js", ".jsx", "/index.ts", "/index.tsx"]
const resolves = (spec) => {
  if (tree.has(spec)) return spec
  for (const x of exts) if (tree.has(spec + x)) return spec + x
  return null
}

const importRe = /(?:from|import)\s*\(?\s*["']([^"']+)["']/g
const problems = []
const scanned = []

for (const f of files) {
  if (!/\.(ts|tsx)$/.test(f)) continue
  if (!tree.has(f)) {
    problems.push({ file: f, specifier: "(missing after copy)", kind: "copy" })
    continue
  }
  scanned.push(f)
  const src = readFileSync(join(root, f), "utf8")
  const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : ""
  let m
  while ((m = importRe.exec(src))) {
    const spec = m[1]
    if (spec.startsWith(".")) {
      const target = posix.normalize(posix.join(dir, spec))
      if (!resolves(target)) problems.push({ file: f, specifier: spec, kind: "relative" })
      continue
    }
    if (spec.startsWith("@") || spec.startsWith("opencode")) {
      const pkg = spec.startsWith("@") ? spec.slice(0, spec.indexOf("/", 1) === -1 ? spec.length : spec.indexOf("/", 1)) : spec
      const mapped = nameToDir.get(pkg)
      if (!mapped) {
        if (pkg.startsWith("@opencode-ai") || pkg.startsWith("@researchos")) {
          problems.push({ file: f, specifier: spec, kind: "unknown-workspace-package" })
        }
        continue
      }
      const sub = spec.slice(pkg.length).replace(/^\//, "")
      if (!sub) {
        if (!resolves(`${mapped}/src/index`)) problems.push({ file: f, specifier: spec, kind: "package-entry" })
        continue
      }
      if (!resolves(`${mapped}/src/${sub}`) && !resolves(`${mapped}/${sub}`)) {
        problems.push({ file: f, specifier: spec, kind: "workspace-subpath" })
      }
      continue
    }
  }
}

const byKind = {}
for (const p of problems) byKind[p.kind] = (byKind[p.kind] || 0) + 1
console.log(`workspace packages: ${nameToDir.size}`)
console.log(`ts/tsx files scanned: ${scanned.length}`)
console.log(`unresolved imports: ${problems.length}`, JSON.stringify(byKind))
const seen = new Set()
for (const p of problems) {
  const key = `${p.kind}:${p.specifier}`
  if (seen.has(key)) continue
  seen.add(key)
  console.log(`  [${p.kind}] ${p.specifier}  <- ${p.file}`)
}
