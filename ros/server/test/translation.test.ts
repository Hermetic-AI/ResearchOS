import { describe, expect, test } from "bun:test"
import { Translation } from "../src/translation"

const S1 =
  "Score-based generative modeling treats data generation as a reverse-time stochastic differential equation, where the score function $\\nabla_x \\log p_t(x)$ guides the denoising steps. Figure 2 shows that 50 steps reach an FID of 2.20 on CIFAR-10 [12, 13]."
const S2 =
  "Diffusion models approximate the data distribution by iteratively removing noise; our method instead learns a deterministic probability flow ODE, which keeps the same marginals while cutting the number of function evaluations to 10."
const S3 =
  "Following Ho et al. (2020), we train an MLP $\\epsilon_\\theta(x_t, t)$ with 3 hidden layers and 256 units each; training uses 128 batches for 40 epochs on 4 GPUs."
const GOOD =
  "基于分数函数的生成建模把数据生成视为一个反向时间随机微分方程，得分函数 $\\nabla_x \\log p_t(x)$ 引导去噪步骤。图 2 显示 50 步在 CIFAR-10 上达到 FID 2.20 [12, 13]。"
const BAD = "基于分数函数的生成建模把数据生成视为反向时间随机微分方程，得分函数引导去噪，图中可见 50 步在 CIFAR-10 上的 FID 为 2.2。"
const TERMS = [
  { source: "score function", target: "得分函数" },
  { source: "probability flow ODE", target: "概率流 ODE" },
]

describe("protected token extraction", () => {
  test("counts math, citation keys, caption references and measured numbers", () => {
    expect(Translation.countByKind(Translation.protect(S1))).toEqual({ formula: 1, cite: 1, caption: 1, number: 3 })
    expect(Translation.protect(S2)).toEqual([{ kind: "number", text: "10" }])
    expect(Translation.countByKind(Translation.protect(S3))).toEqual({ formula: 1, cite: 1, caption: 0, number: 5 })
  })

  test("digits inside math and citation brackets are not re-counted as numbers", () => {
    const numbers = Translation.tokensOf(S3, "number")
    expect(numbers).toEqual(["3", "256", "128", "40 epochs", "4"])
    expect(Translation.tokensOf(S3, "formula")).toEqual(["$\\epsilon_\\theta(x_t, t)$"])
    expect(Translation.tokensOf(S1, "cite")).toEqual(["[12, 13]"])
    expect(Translation.tokensOf(S1, "caption")).toEqual(["Figure 2"])
  })
})

describe("segment audit", () => {
  test("a faithful draft passes with zero leaks and one applied term", () => {
    const audit = Translation.auditSegment(S1, GOOD, TERMS)
    expect(audit.leaks).toEqual([])
    expect(audit.applied).toEqual(["score function"])
    expect(audit.skipped).toEqual([])
  })

  test("dropped math, citation, caption number and decimal are each reported", () => {
    const audit = Translation.auditSegment(S1, BAD, TERMS)
    expect(audit.leaks.map((token) => token.kind)).toEqual(["formula", "cite", "caption", "number"])
    expect(audit.leaks.map((token) => token.text)).toEqual([
      "$\\nabla_x \\log p_t(x)$",
      "[12, 13]",
      "Figure 2",
      "2.20",
    ])
    expect(audit.applied).toEqual(["score function"])
    expect(audit.skipped).toEqual([])
  })

  test("a source term whose agreed translation is absent is reported as skipped", () => {
    const audit = Translation.auditSegment(S2, "扩散模型通过迭代去噪逼近数据分布；我们的方法转而学习确定性 ODE，把函数评估次数降到 10 步。", TERMS)
    expect(audit.applied).toEqual([])
    expect(audit.skipped).toEqual(["probability flow ODE"])
    expect(audit.leaks).toEqual([])
  })

  test("translating a unit word does not count as a number leak", () => {
    const audit = Translation.auditSegment(S1, GOOD.replace("50 步", "50 个采样步骤"), TERMS)
    expect(audit.leaks).toEqual([])
  })
})

describe("draft audit", () => {
  const rows = [
    { section: "4.1", seq: 1, page: 12, source: S1, target: GOOD, status: "draft" },
    { section: "4.1", seq: 2, page: 12, source: S2, target: "", status: "todo" },
    {
      section: "4.2",
      seq: 1,
      page: 13,
      source: S3,
      target:
        "沿用 Ho et al. (2020) 的做法，我们训练一个 MLP $\\epsilon_\\theta(x_t, t)$，含 3 个隐藏层、每层 256 个单元；训练使用 128 的批量、40 epochs、4 块 GPU。",
      status: "final",
    },
  ]

  test("rolls up section progress, glossary rail status and protection totals", () => {
    const draft = Translation.auditDraft(rows, [...TERMS, { source: "churn", target: "" }])
    expect(draft.segments).toBe(3)
    expect(draft.translated).toBe(2)
    expect(draft.sections).toEqual([
      { section: "4.1", total: 2, final: 0, draft: 1, todo: 1, protected: { formula: 1, cite: 1, caption: 1, number: 4 } },
      { section: "4.2", total: 1, final: 1, draft: 0, todo: 0, protected: { formula: 1, cite: 1, caption: 0, number: 5 } },
    ])
    expect(draft.protected_total).toBe(14)
    expect(draft.leaks).toEqual([])
    expect(draft.terms).toEqual([
      { source: "score function", target: "得分函数", note: "", count: 1, status: "used" },
      { source: "churn", target: "", note: "", count: 0, status: "pending" },
      { source: "probability flow ODE", target: "概率流 ODE", note: "", count: 0, status: "missing" },
    ])
  })

  test("an untouched draft marks glossary terms unused instead of missing", () => {
    const draft = Translation.auditDraft(rows.map((row) => ({ ...row, target: "" })), TERMS)
    expect(draft.terms.map((term) => term.status)).toEqual(["unused", "unused"])
    expect(draft.leaks).toEqual([])
  })

  test("a missing reference number surfaces as a leak with its anchor", () => {
    const dropped = { section: "4.1", seq: 1, page: 12, source: S1, target: GOOD.replace("[12, 13]", "相关工作"), status: "draft" }
    const draft = Translation.auditDraft([dropped], [])
    expect(draft.leaks).toEqual([{ section: "4.1", seq: 1, kind: "cite", text: "[12, 13]" }])
  })
})

describe("export", () => {
  test("markdown exports only translated paragraphs with the source underneath", () => {
    const md = Translation.toMarkdown("Denoising Diffusion RNNs", [
      { section: "4.1", seq: 1, page: 12, source: S1, target: GOOD, status: "draft" },
      { section: "4.1", seq: 2, page: 12, source: S2, target: "   ", status: "todo" },
    ])
    expect(md).toContain("# Denoising Diffusion RNNs")
    expect(md).toContain("已译 1/2 段")
    expect(md).toContain("## 4.1 ¶1")
    expect(md).toContain(GOOD)
    expect(md).toContain(`> 原文：${S1}`)
    expect(md).not.toContain(S2)
  })

  test("bilingual html escapes markup and keeps both panes per paragraph", () => {
    const html = Translation.toBilingualHtml("P", [
      { section: "3", seq: 1, page: 9, source: "if x < y then <script>", target: "当 x < y 时", status: "final" },
      { section: "3", seq: 2, page: null, source: "tail", target: "", status: "todo" },
    ])
    expect(html).toContain('<meta charset="UTF-8">')
    expect(html).toContain('<section class="para" data-status="final">')
    expect(html).toContain("if x &lt; y then &lt;script&gt;")
    expect(html).toContain("3 ¶1 · p.9")
    expect(html).toContain("3 ¶2")
    expect(html).not.toContain("<script>")
  })
})
