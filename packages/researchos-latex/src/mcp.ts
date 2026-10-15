import { resolve } from "path"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { z } from "zod"
import { compile } from "./compile"
import { formatCheck } from "./format"
import { synctexQuery } from "./query"

export function createLatexMcpServer(projectRoot: string, env: Record<string, string | undefined> = process.env) {
  const server = new McpServer({ name: "researchos-latex", version: "0.1.0" })
  const root = resolve(projectRoot)

  server.registerTool("compile", {
    description: "Compile a LaTeX main file with Tectonic, returning structured diagnostics and the PDF path",
    inputSchema: {
      main_file: z.string().describe("Main .tex file, relative to the project root"),
    },
  }, ({ main_file }) =>
    compile({ projectRoot: root, mainFile: main_file, env }).then((result) =>
      json(result, { panel: "latex", resource: main_file, mode: "auto" }),
    ),
  )

  server.registerTool("synctex", {
    description:
      "SyncTeX bidirectional lookup. Forward: pass file+line (and main_file to locate the build). " +
      "Inverse: pass pdf_path+page+x+y (pt) to jump back to source.",
    inputSchema: {
      main_file: z.string().optional(),
      file: z.string().optional(),
      line: z.number().optional(),
      pdf_path: z.string().optional(),
      page: z.number().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
    },
  }, async (args) => json(await synctexQuery(root, {
    ...(args.main_file ? { mainFile: args.main_file } : {}),
    ...(args.file ? { file: args.file } : {}),
    ...(args.line !== undefined ? { line: args.line } : {}),
    ...(args.pdf_path ? { pdfPath: args.pdf_path } : {}),
    ...(args.page !== undefined ? { page: args.page } : {}),
    ...(args.x !== undefined ? { x: args.x } : {}),
    ...(args.y !== undefined ? { y: args.y } : {}),
  }), { panel: "latex", resource: args.main_file ?? args.file, mode: "badge" }))

  server.registerTool("format_check", {
    description: "Check a LaTeX project for citation/reference integrity, brace balance, figure caption/label, and template compliance",
    inputSchema: {
      main_file: z.string(),
      template: z.enum(["ieee", "acm"]).optional(),
    },
  }, ({ main_file, template }) => json(formatCheck({ projectRoot: root, mainFile: main_file, template }), { panel: "latex", resource: main_file, mode: "auto" }))

  return { server }
}

function json(value: unknown, ui?: { panel: string; resource?: string; mode: "auto" | "confirm" | "badge" }) {
  const metadata = ui ? { "researchos.ui": ui } : undefined
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value) }],
    ...(metadata ? { metadata } : {}),
  }
}

if (import.meta.main) {
  const { server } = createLatexMcpServer(process.env.RESEARCHOS_PROJECT_ROOT ?? process.cwd())
  await server.connect(new StdioServerTransport())
}
