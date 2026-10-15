import { describe, expect, test } from "bun:test"
import { convertCsvToLatex, convertMdToLatex } from "../src/convert"

describe("convertCsvToLatex", () => {
  test("booktabs table with numeric right alignment and escaping", () => {
    const latex = convertCsvToLatex({
      csv: "Model,Accuracy,Notes\nBaseline,0.87,uses dropout\nOurs,0.92,50% better & faster\n",
      caption: "Main results",
      label: "tab:main",
    })
    expect(latex).toContain("\\begin{tabular}{lrl}")
    expect(latex).toContain("\\toprule")
    expect(latex).toContain("\\midrule")
    expect(latex).toContain("\\bottomrule")
    expect(latex).toContain("Model & Accuracy & Notes \\\\")
    expect(latex).toContain("Ours & 0.92 & 50\\% better \\& faster \\\\")
    expect(latex).toContain("\\caption{Main results}")
    expect(latex).toContain("\\label{tab:main}")
  })

  test("parses quoted cells with commas and newlines", () => {
    const latex = convertCsvToLatex({ csv: 'Name,Score\n"Doe, Jane",95\n"Multi\nLine",88\n' })
    expect(latex).toContain("Doe, Jane & 95 \\\\")
    expect(latex).toContain("Multi\nLine & 88 \\\\")
  })

  test("rejects header-only CSV", () => {
    expect(() => convertCsvToLatex({ csv: "a,b,c\n" })).toThrow(/header row/)
  })
})

describe("convertMdToLatex", () => {
  test("converts headings, emphasis, lists, code and math passthrough", () => {
    const latex = convertMdToLatex([
      "# Introduction",
      "",
      "We study **attention** and *sparse* models with `O(n)` cost, i.e. $O(n \\log n)$.",
      "",
      "- first point",
      "- second point",
      "",
      "1. step one",
      "2. step two",
      "",
      "```python",
      "def f(x):",
      "    return x",
      "```",
    ].join("\n"))
    expect(latex).toContain("\\section*{Introduction}")
    expect(latex).toContain("\\textbf{attention}")
    expect(latex).toContain("\\textit{sparse}")
    expect(latex).toContain("\\texttt{O(n)}")
    expect(latex).toContain("$O(n \\log n)$")
    expect(latex).toContain("\\begin{itemize}\n  \\item first point\n  \\item second point\n\\end{itemize}")
    expect(latex).toContain("\\begin{enumerate}\n  \\item step one\n  \\item step two\n\\end{enumerate}")
    expect(latex).toContain("\\begin{lstlisting}\ndef f(x):\n    return x\n\\end{lstlisting}")
  })

  test("converts gfm tables to booktabs", () => {
    const latex = convertMdToLatex([
      "| Model | Score |",
      "| --- | --- |",
      "| Ours | 0.9 |",
    ].join("\n"))
    expect(latex).toContain("\\begin{tabular}{ll}")
    expect(latex).toContain("Ours & 0.9 \\\\")
  })

  test("unsupported tokens degrade to TODO comments", () => {
    const latex = convertMdToLatex("![architecture](fig/arch.png)")
    expect(latex).toContain("% TODO: unsupported token 'image'")
    expect(convertMdToLatex("~~deleted~~")).toContain("% TODO: unsupported token")
  })
})
