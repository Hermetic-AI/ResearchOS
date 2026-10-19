import { readFileSync, writeFileSync, existsSync } from "node:fs"

const targets = process.argv.slice(2)
const re = /(from\s+|import\s+\(\s*)(["'])(\.{1,2}\/[^"']+)\2/g

let changed = 0
for (const file of targets) {
  const src = readFileSync(file, "utf8")
  const dir = file.slice(0, file.lastIndexOf("/"))
  let out = ""
  let last = 0
  let m
  re.lastIndex = 0
  while ((m = re.exec(src))) {
    const spec = m[3]
    if (/\.(js|css|svg|json|html)$/.test(spec)) continue
    const abs = `${dir}/${spec}`
    let fixed = null
    for (const ext of [".ts", ".tsx", ".mts"]) {
      if (existsSync(abs + ext)) {
        fixed = spec + ".js"
        break
      }
    }
    if (!fixed && existsSync(`${abs}/index.ts`)) fixed = spec + "/index.js"
    if (!fixed) continue
    out += src.slice(last, m.index) + m[1] + m[2] + fixed + m[2]
    last = m.index + m[0].length
  }
  if (!out) continue
  out += src.slice(last)
  if (out !== src) {
    writeFileSync(file, out)
    changed++
    console.log(`js-ext: ${file}`)
  }
}
console.log(`files rewritten: ${changed}`)
