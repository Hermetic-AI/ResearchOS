import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs"
import { basename, dirname, extname, relative, resolve } from "path"
import { Plugin } from "@opencode/plugin"
import { Schema } from "effect"
import { includeGraphicsSnippet } from "./latex"
import { PlotStore, resolveInside } from "./store"

export default Plugin.define({
  id: "researchos.plot",
  async setup(ctx) {
    const root = ctx.location.directory
    await ctx.tool.transform((editor) => {
      editor.add({
        name: "mermaid_render",
        description: "Validate Mermaid source and persist it as a reproducible diagram artifact",
        input: Schema.Struct({
          code: Schema.String,
          theme: Schema.optionalKey(Schema.String),
          name: Schema.optionalKey(Schema.String),
        }),
        execute: async (args) => {
          try {
            return { content: JSON.stringify(await persistMermaid(root, args)) }
          } catch (error) {
            return { content: JSON.stringify({ errors: [message(error)] }) }
          }
        },
      })

      editor.add({
        name: "graphviz_render",
        description: "Render Graphviz DOT source to SVG using the bundled WASM renderer",
        input: Schema.Struct({
          dot: Schema.String,
          engine: Schema.optionalKey(Schema.Literals(["dot", "neato", "fdp"])).annotate({
            description: "Layout engine, defaults to dot",
          }),
          name: Schema.optionalKey(Schema.String),
        }),
        execute: async (args) => ({ content: JSON.stringify(await persistGraphviz(root, args)) }),
      })

      editor.add({
        name: "diagram_edit",
        description: "Create or open a draw.io diagram inside the project artifact directory",
        input: Schema.Struct({
          action: Schema.Literals(["create", "open"]),
          file: Schema.optionalKey(Schema.String),
          stencil_pack: Schema.optionalKey(Schema.Literals(["nn_layers", "agent", "flow"])),
        }),
        execute: async (args) => ({ content: JSON.stringify(editDiagram(root, args)) }),
      })

      editor.add({
        name: "insert_to_paper",
        description: "Insert a LaTeX figure block for an artifact into a project .tex file",
        input: Schema.Struct({
          artifact_path: Schema.String,
          tex_file: Schema.String,
          section: Schema.optionalKey(Schema.String),
          caption: Schema.String,
          label: Schema.optionalKey(Schema.String),
        }),
        execute: async (args) => ({ content: JSON.stringify(insertArtifactToPaper(root, args)) }),
      })
    })
  },
})

function artifactPath(root: string, folder: string, name: string, extension: string) {
  const directory = resolve(root, ".researchos", "plots", folder)
  mkdirSync(directory, { recursive: true })
  const safe = basename(name, extname(name)).replace(/[^a-zA-Z0-9_-]+/g, "-") || "diagram"
  return resolve(directory, `${safe}${extension}`)
}

export function projectPath(root: string, path: string) {
  return relative(root, path).replaceAll("\\", "/")
}

function insertSnippet(content: string, snippet: string, section?: string) {
  if (!section) return `${content.trimEnd()}\n\n${snippet}\n`
  const marker = `\\section{${section}}`
  const start = content.indexOf(marker)
  if (start < 0) throw new Error(`section not found: ${section}`)
  const next = content.indexOf("\\section{", start + marker.length)
  const offset = next < 0 ? content.length : next
  return `${content.slice(0, offset).trimEnd()}\n\n${snippet}\n\n${content.slice(offset).trimStart()}`
}

function emptyDrawio(name: string, stencil?: string) {
  return `<mxfile host="ResearchOS"><diagram name="${escapeXml(name)}"${stencil ? ` data-stencil="${stencil}"` : ""}><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>`
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
}

function required(value: string | undefined, error: string) {
  if (!value) throw new Error(error)
  return value
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export async function validateMermaid(code: string) {
  const mermaid = (await import("mermaid")).default
  return mermaid.parse(code)
}

export async function renderGraphviz(dot: string, engine: "dot" | "neato" | "fdp" = "dot") {
  const { Graphviz } = await import("@hpcc-js/wasm")
  return (await Graphviz.load()).layout(dot, "svg", engine)
}

export async function persistMermaid(root: string, input: { code: string; name?: string; theme?: string }) {
  await validateMermaid(input.code)
  const path = artifactPath(root, "diagrams", input.name ?? "diagram", ".mmd")
  writeFileSync(path, input.code)
  const store = new PlotStore(root)
  const artifact = store.registerArtifact({ kind: "mermaid", path: projectPath(root, path) })
  store.close()
  return { artifactId: artifact.id, artifactPath: artifact.path, code: input.code }
}

export async function persistGraphviz(
  root: string,
  input: { dot: string; engine?: "dot" | "neato" | "fdp"; name?: string },
) {
  const svg = await renderGraphviz(input.dot, input.engine)
  const source = artifactPath(root, "diagrams", input.name ?? "diagram", ".dot")
  const output = source.replace(/\.dot$/, ".svg")
  writeFileSync(source, input.dot)
  writeFileSync(output, svg)
  const store = new PlotStore(root)
  const artifact = store.registerArtifact({ kind: "graphviz", path: projectPath(root, output), previewSvg: svg })
  store.close()
  return { artifactId: artifact.id, artifactPath: artifact.path, svg }
}

export function editDiagram(
  root: string,
  input: { action: "create" | "open"; file?: string; stencil_pack?: "nn_layers" | "agent" | "flow" },
) {
  const path = input.action === "open"
    ? resolveInside(root, required(input.file, "file is required when action=open"))
    : artifactPath(root, "diagrams", input.file ?? "diagram", ".drawio")
  if (input.action === "open" && !existsSync(path)) throw new Error(`draw.io file not found: ${input.file}`)
  if (input.action === "create") {
    writeFileSync(path, emptyDrawio(basename(path, ".drawio"), input.stencil_pack))
    const store = new PlotStore(root)
    store.registerArtifact({ kind: "drawio", path: projectPath(root, path) })
    store.close()
  }
  return { file: projectPath(root, path) }
}

export function saveDiagram(root: string, input: { file: string; xml: string }) {
  const path = resolveInside(root, input.file)
  if (extname(path).toLowerCase() !== ".drawio") throw new Error("draw.io file must use the .drawio extension")
  if (!existsSync(path)) throw new Error(`draw.io file not found: ${input.file}`)
  if (!/^\s*<mxfile(?:\s|>)/.test(input.xml) && !/^\s*<mxGraphModel(?:\s|>)/.test(input.xml)) {
    throw new Error("invalid draw.io XML")
  }
  const temporary = `${path}.tmp-${crypto.randomUUID()}`
  writeFileSync(temporary, input.xml, "utf8")
  renameSync(temporary, path)
  return { file: projectPath(root, path) }
}

export function insertArtifactToPaper(root: string, input: {
  artifact_path: string
  tex_file: string
  section?: string
  caption: string
  label?: string
}) {
  const artifact = resolveInside(root, input.artifact_path)
  const tex = resolveInside(root, input.tex_file)
  if (!existsSync(artifact)) throw new Error(`artifact not found: ${input.artifact_path}`)
  if (!existsSync(tex)) throw new Error(`tex file not found: ${input.tex_file}`)
  const label = input.label ?? `fig:${basename(artifact, extname(artifact)).replace(/[^a-zA-Z0-9-]+/g, "-")}`
  const snippet = includeGraphicsSnippet({
    path: relative(dirname(tex), artifact).replaceAll("\\", "/"),
    caption: input.caption,
    label,
  })
  writeFileSync(tex, insertSnippet(readFileSync(tex, "utf8"), snippet, input.section))
  const store = new PlotStore(root)
  store.markReferenced(projectPath(root, artifact), projectPath(root, tex), label)
  store.close()
  return { ok: true as const, latexSnippet: snippet }
}

export { includeGraphicsSnippet } from "./latex"
export { ChartSpec, CHART_TEMPLATES, JOURNAL_THEMES, SignificanceStars, mergeChartSpec, pValueToStars } from "./spec"
export { JournalThemes } from "./themes"
export { PlotStore, resolveInside } from "./store"
export { tikzExport } from "./tikz"
