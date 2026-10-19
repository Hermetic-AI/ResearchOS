import { readFileSync, writeFileSync } from "node:fs"

const read = (f) => {
  const raw = readFileSync(f, "utf8")
  const crlf = raw.includes("\r\n")
  return { text: crlf ? raw.replaceAll("\r\n", "\n") : raw, crlf }
}
const write = (f, { text, crlf }) => writeFileSync(f, crlf ? text.replaceAll("\n", "\r\n") : text)

const pairs = [
  ["researchos-assets", "ResearchosAssetsHandler", "ResearchosAssetsGroup"],
  ["researchos-literature", "ResearchosLiteratureHandler", "ResearchosLiteratureGroup"],
  ["researchos-graph", "ResearchosGraphHandler", "ResearchosGraphGroup"],
  ["researchos-latex", "ResearchosLatexHandler", "ResearchosLatexGroup"],
  ["researchos-writing", "ResearchosWritingHandler", "ResearchosWritingGroup"],
  ["researchos-data", "ResearchosDataHandler", "ResearchosDataGroup"],
  ["researchos-plot", "ResearchosPlotHandler", "ResearchosPlotGroup"],
  ["researchos-reproduce", "ResearchosReproduceHandler", "ResearchosReproduceGroup"],
  ["researchos-translate", "ResearchosTranslateHandler", "ResearchosTranslateGroup"],
]

const apiFile = "packages/protocol/src/api.ts"
const api = read(apiFile)
let src = api.text
const steps = []
const subst = (label, anchor, addition) => {
  if (!src.includes(anchor)) return steps.push(`MISS ${label}`)
  if (src.includes(addition.split("\n")[0])) return steps.push(`SKIP ${label} (already present)`)
  src = src.replace(anchor, anchor + addition)
  steps.push(`OK ${label}`)
}
subst(
  "api imports",
  'import { ConfigGroup } from "./groups/config.js"\n',
  pairs.map(([file, , g]) => `import { ${g} } from "./groups/${file}.js"\n`).join(""),
)
subst(
  "api union",
  "  | HttpApiGroup.AddMiddleware<typeof ConfigGroup, LocationId>\n",
  pairs.map(([, , g]) => `  | HttpApiGroup.AddMiddleware<typeof ${g}, LocationId>\n`).join(""),
)
subst(
  "api adds",
  "    .add(ConfigGroup.middleware(locationMiddleware))\n",
  pairs.map(([, , g]) => `    .add(${g}.middleware(locationMiddleware))\n`).join(""),
)
write(apiFile, { text: src, crlf: api.crlf })

const hFile = "packages/server/src/handlers.ts"
const hObj = read(hFile)
let h = hObj.text
const hAnchor = 'import { ConfigHandler } from "./handlers/config"\n'
if (h.includes(hAnchor) && !h.includes("ResearchosAssetsHandler")) {
  h = h.replace(hAnchor, hAnchor + pairs.map(([file, name]) => `import { ${name} } from "./handlers/${file}"\n`).join(""))
  h = h.replace("  ConfigHandler,\n", "  ConfigHandler,\n" + pairs.map(([, name]) => `  ${name},\n`).join(""))
  steps.push("OK handlers")
} else steps.push("MISS/SKIP handlers")
write(hFile, { text: h, crlf: hObj.crlf })

console.log(steps.join("\n"))
console.log(`verify api.ts researchos refs: ${(read(apiFile).text.match(/Researchos\w*Group/g) || []).length}`)
console.log(`verify handlers.ts refs: ${(read(hFile).text.match(/Researchos\w*Handler/g) || []).length}`)
