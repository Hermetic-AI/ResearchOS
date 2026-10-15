import EditorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker"
import { createEffect, onCleanup, onMount } from "solid-js"

type Marker = { line: number; message: string; severity: "error" | "warning" | "info" }
type Selection = { text: string; start: number; end: number }

let languageRegistered = false

export function MonacoLatex(props: {
  content: string
  file: string
  citations: string[]
  markers: Marker[]
  revealLine?: number
  onChange: (value: string) => void
  onCursor: (line: number) => void
  onSelection: (selection: Selection) => void
}) {
  let container!: HTMLDivElement
  let editor: import("monaco-editor/esm/vs/editor/editor.api").editor.IStandaloneCodeEditor | undefined
  let monaco: typeof import("monaco-editor/esm/vs/editor/editor.api") | undefined
  let applying = false

  onMount(async () => {
    Object.assign(globalThis, {
      MonacoEnvironment: { getWorker: () => new EditorWorker() },
    })
    monaco = await import("monaco-editor/esm/vs/editor/editor.api")
    if (!languageRegistered) {
      monaco.languages.register({ id: "researchos-latex", extensions: [".tex", ".bib"] })
      monaco.languages.setMonarchTokensProvider("researchos-latex", {
        tokenizer: {
          root: [
            [/%.*$/, "comment"],
            [/\\(?:begin|end)\{[^}]+\}/, "keyword"],
            [/\\[a-zA-Z@]+\*?/, "keyword"],
            [/\$\$?|\\\[|\\\]/, "string.math"],
            [/[{}\[\]]/, "delimiter"],
            [/@\w+\s*\{/, "type.identifier"],
          ],
        },
      })
      monaco.languages.registerCompletionItemProvider("researchos-latex", {
        triggerCharacters: ["{", ","],
        provideCompletionItems: (model, position) => {
          const prefix = model.getLineContent(position.lineNumber).slice(0, position.column - 1)
          if (!/\\(?:cite|citet|citep|parencite|textcite)(?:\[[^\]]*\])*\{[^}]*$/.test(prefix)) return { suggestions: [] }
          const word = model.getWordUntilPosition(position)
          return {
            suggestions: props.citations.map((key) => ({
              label: key,
              kind: monaco!.languages.CompletionItemKind.Reference,
              insertText: key,
              range: {
                startLineNumber: position.lineNumber,
                endLineNumber: position.lineNumber,
                startColumn: word.startColumn,
                endColumn: word.endColumn,
              },
            })),
          }
        },
      })
      languageRegistered = true
    }
    editor = monaco.editor.create(container, {
      value: props.content,
      language: props.file.endsWith(".bib") ? "researchos-latex" : "researchos-latex",
      automaticLayout: true,
      fontFamily: "'JetBrains Mono', 'SFMono-Regular', Consolas, monospace",
      fontSize: 13,
      lineHeight: 21,
      minimap: { enabled: false },
      renderLineHighlight: "gutter",
      scrollBeyondLastLine: false,
      wordWrap: "on",
      padding: { top: 14, bottom: 14 },
      theme: document.documentElement.classList.contains("dark") ? "vs-dark" : "vs",
    })
    editor.onDidChangeModelContent(() => {
      if (applying) return
      props.onChange(editor?.getValue() ?? "")
    })
    editor.onDidChangeCursorPosition((event) => props.onCursor(event.position.lineNumber))
    editor.onDidChangeCursorSelection((event) => {
      const model = editor?.getModel()
      if (!model) return
      props.onSelection({
        text: model.getValueInRange(event.selection),
        start: model.getOffsetAt(event.selection.getStartPosition()),
        end: model.getOffsetAt(event.selection.getEndPosition()),
      })
    })
    if (props.revealLine) {
      editor.revealLineInCenter(props.revealLine)
      editor.setPosition({ lineNumber: props.revealLine, column: 1 })
    }
    monaco.editor.setModelMarkers(editor.getModel()!, "researchos-latex", props.markers.map((marker) => ({
      startLineNumber: Math.max(1, marker.line),
      endLineNumber: Math.max(1, marker.line),
      startColumn: 1,
      endColumn: 200,
      message: marker.message,
      severity: marker.severity === "error" ? monaco!.MarkerSeverity.Error : marker.severity === "warning" ? monaco!.MarkerSeverity.Warning : monaco!.MarkerSeverity.Info,
    })))
  })

  createEffect(() => {
    const value = props.content
    if (!editor || editor.getValue() === value) return
    applying = true
    editor.setValue(value)
    applying = false
  })

  createEffect(() => {
    if (!editor || !monaco) return
    monaco.editor.setModelMarkers(editor.getModel()!, "researchos-latex", props.markers.map((marker) => ({
      startLineNumber: Math.max(1, marker.line),
      endLineNumber: Math.max(1, marker.line),
      startColumn: 1,
      endColumn: 200,
      message: marker.message,
      severity: marker.severity === "error" ? monaco!.MarkerSeverity.Error : marker.severity === "warning" ? monaco!.MarkerSeverity.Warning : monaco!.MarkerSeverity.Info,
    })))
  })

  createEffect(() => {
    if (!editor || !props.revealLine) return
    editor.revealLineInCenter(props.revealLine)
    editor.setPosition({ lineNumber: props.revealLine, column: 1 })
    editor.focus()
  })

  onCleanup(() => editor?.dispose())
  return <div ref={container} class="h-full min-h-0 w-full" />
}
