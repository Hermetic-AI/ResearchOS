import { existsSync, mkdirSync, readFileSync, renameSync } from "fs"
import { basename, dirname, relative, resolve, sep } from "path"
import { buildDir } from "./paths"
import { parseBibtex } from "./bibtex"
import { parseOutline } from "./outline"

const SOURCE_EXTENSIONS = [".tex", ".bib"]

export async function listSources(projectRoot: string) {
  const root = resolve(projectRoot)
  const files = await Array.fromAsync(new Bun.Glob("**/*.{tex,bib}").scan({ cwd: root, onlyFiles: true }))
  return files
    .filter((file) => !file.replaceAll("\\", "/").split("/").some((segment) => [".researchos", ".git", "node_modules"].includes(segment)))
    .map((file) => file.replaceAll("\\", "/"))
    .sort((left, right) => left.localeCompare(right))
}

export function readSource(projectRoot: string, file: string) {
  const path = resolveSource(projectRoot, file)
  if (!existsSync(path)) throw new Error(`Source file not found: ${file}`)
  const content = readFileSync(path, "utf8")
  return {
    file: relative(resolve(projectRoot), path).replaceAll("\\", "/"),
    content,
    outline: file.endsWith(".tex") ? parseOutline(content) : [],
    bibliography: file.endsWith(".bib") ? parseBibtex(content) : [],
  }
}

export async function writeSource(projectRoot: string, file: string, content: string) {
  const path = resolveSource(projectRoot, file)
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${crypto.randomUUID()}.tmp`
  await Bun.write(temporary, content)
  renameSync(temporary, path)
  return { file: relative(resolve(projectRoot), path).replaceAll("\\", "/"), bytes: new TextEncoder().encode(content).byteLength }
}

export function readBuildPdf(projectRoot: string, mainFile: string) {
  const source = resolveSource(projectRoot, mainFile)
  if (!source.endsWith(".tex")) throw new Error("PDF main file must use the .tex extension")
  const path = resolve(buildDir(resolve(projectRoot)), `${basename(source, ".tex")}.pdf`)
  const root = resolve(buildDir(resolve(projectRoot)))
  if (!path.startsWith(root + sep) || !existsSync(path)) throw new Error(`Compiled PDF not found for: ${mainFile}`)
  return { file: relative(resolve(projectRoot), path).replaceAll("\\", "/"), data: readFileSync(path).toString("base64") }
}

function resolveSource(projectRoot: string, file: string) {
  const root = resolve(projectRoot)
  const path = resolve(root, file)
  if (!path.startsWith(root + sep)) throw new Error(`Source path escapes project root: ${file}`)
  if (!SOURCE_EXTENSIONS.some((extension) => path.toLowerCase().endsWith(extension))) throw new Error(`Unsupported source extension: ${file}`)
  return path
}
