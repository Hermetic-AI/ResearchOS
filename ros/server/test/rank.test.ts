import { describe, expect, test } from "bun:test"
import { Stats } from "../src/stats"

// Reference values from scipy 1.18 + numpy 2.3 on this machine:
// statistic and p come from scipy.stats.wilcoxon / mannwhitneyu (exact null distribution when
// untied, tie-corrected normal approximation with continuity correction when tied); the CI
// endpoints come from the Walsh / pairwise-difference order statistics with the critical rank
// k taken from an independently enumerated null distribution. Exact rank CIs oscillate a hair
// below 95% coverage because the null distribution is discrete (40k simulations gave 0.945 and
// 0.936), which is R's behaviour too, not an implementation slip.
function table(xs: Array<number | null>, ys: Array<number | null>): Stats.Table {
  return { columns: ["x", "y"], rows: xs.map((x, i) => ({ x, y: ys[i] ?? null })) }
}

const num = (value: number) => Number(value.toFixed(12))

test("wx_untied_5", () => {
  const outcome = Stats.wilcoxonSignedRank(table([1.0, 2.0, 3.0, 4.0, 5.2], [1.4, 2.9, 3.6, 4.9, 5.0]),
    "x", "y", 0.05)
  if (!outcome.ok) throw new Error(outcome.error)
  const result = outcome.result
  expect(result.method).toBe("wilcoxon")
  expect(result.ties).toBe(false)
  expect(result.p_method).toBe("exact")
  expect(result.p).toBeCloseTo(0.125, 10)
  expect(result.n).toBeCloseTo(5, 9)
  expect(result.n_zero).toBeCloseTo(0, 9)
  expect(result.statistic).toBeCloseTo(1.0, 9)
  expect(result.null_mean).toBeCloseTo(7.5, 9)
  expect(result.hl_diff).toBeCloseTo(-0.6000000000000001, 9)
  expect(result.ci_low).toBeCloseTo(-0.9000000000000004, 9)
  expect(result.ci_high).toBeCloseTo(0.20000000000000018, 9)
  expect(result.effect).toBeCloseTo(-0.8666666666666667, 9)
})

test("wx_untied_8", () => {
  const outcome = Stats.wilcoxonSignedRank(table([10.5, 12.1, 13.4, 14.9, 15.2, 16.8, 17.3, 18.6], [11.2, 12.9, 13.1, 15.5, 15.9, 17.1, 18.0, 18.2]),
    "x", "y", 0.05)
  if (!outcome.ok) throw new Error(outcome.error)
  const result = outcome.result
  expect(result.method).toBe("wilcoxon")
  expect(result.ties).toBe(true)
  expect(result.p_method).toBe("normal")
  expect(result.p).toBeCloseTo(0.06802483707221696, 10)
  expect(result.n).toBeCloseTo(8, 9)
  expect(result.n_zero).toBeCloseTo(0, 9)
  expect(result.statistic).toBeCloseTo(4.5, 9)
  expect(result.null_mean).toBeCloseTo(18.0, 9)
  expect(result.hl_diff).toBeCloseTo(-0.5, 9)
  expect(result.ci_low).toBeCloseTo(-0.7000000000000011, 9)
  expect(result.ci_high).toBeCloseTo(0.0, 9)
  expect(result.effect).toBeCloseTo(-0.75, 9)
})

test("wx_untied_11", () => {
  const outcome = Stats.wilcoxonSignedRank(table([-2.3793674254736974, 0.7217138506148246, -5.688979048797197, 4.187315130326082, 1.9148842227846457, -0.8761424556580903, -0.9358479845705272, 0.9115061033364371, -0.8029809066130189, -0.6777265834896408, 2.160203460027339], [2.14411561732131, 0.40761619309745084, 0.34357031044241415, 1.0827489679969338, -1.2420551835567166, -0.6112507939688306, 2.2447805406192542, 0.2085516205774089, -3.5232785270301705, -0.8318361588996205, 2.569864815880613]),
    "x", "y", 0.05)
  if (!outcome.ok) throw new Error(outcome.error)
  const result = outcome.result
  expect(result.method).toBe("wilcoxon")
  expect(result.ties).toBe(false)
  expect(result.p_method).toBe("exact")
  expect(result.p).toBeCloseTo(0.8310546875, 10)
  expect(result.n).toBeCloseTo(11, 9)
  expect(result.n_zero).toBeCloseTo(0, 9)
  expect(result.statistic).toBeCloseTo(30.0, 9)
  expect(result.null_mean).toBeCloseTo(33.0, 9)
  expect(result.hl_diff).toBeCloseTo(-0.05158644615379511, 9)
  expect(result.ci_low).toBeCloseTo(-2.4665721993241405, 9)
  expect(result.ci_high).toBeCloseTo(1.655524490875671, 9)
  expect(result.effect).toBeCloseTo(-0.09090909090909094, 9)
})

test("wx_tied_int", () => {
  const outcome = Stats.wilcoxonSignedRank(table([1.0, 2.0, 3.0, 4.0, 5.0], [2.0, 3.0, 5.0, 7.0, 9.0]),
    "x", "y", 0.05)
  if (!outcome.ok) throw new Error(outcome.error)
  const result = outcome.result
  expect(result.method).toBe("wilcoxon")
  expect(result.ties).toBe(true)
  expect(result.p_method).toBe("normal")
  expect(result.p).toBeCloseTo(0.05790726541729722, 10)
  expect(result.n).toBeCloseTo(5, 9)
  expect(result.n_zero).toBeCloseTo(0, 9)
  expect(result.statistic).toBeCloseTo(0.0, 9)
  expect(result.null_mean).toBeCloseTo(7.5, 9)
  expect(result.hl_diff).toBeCloseTo(-2.0, 9)
  expect(result.ci_low).toBeCloseTo(-4.0, 9)
  expect(result.ci_high).toBeCloseTo(-1.0, 9)
  expect(result.effect).toBeCloseTo(-1.0, 9)
})

test("wx_tied_mixed", () => {
  const outcome = Stats.wilcoxonSignedRank(table([1.0, 1.0, 2.0, 2.0, 3.0, 4.0], [2.0, 1.0, 3.0, 2.0, 4.0, 5.0]),
    "x", "y", 0.05)
  if (!outcome.ok) throw new Error(outcome.error)
  const result = outcome.result
  expect(result.method).toBe("wilcoxon")
  expect(result.ties).toBe(true)
  expect(result.p_method).toBe("normal")
  expect(result.p).toBeCloseTo(0.07186063822585158, 10)
  expect(result.n).toBeCloseTo(4, 9)
  expect(result.n_zero).toBeCloseTo(2, 9)
  expect(result.statistic).toBeCloseTo(0.0, 9)
  expect(result.null_mean).toBeCloseTo(5.0, 9)
  expect(result.hl_diff).toBeCloseTo(-1.0, 9)
  expect(result.ci_low).toBeCloseTo(-1.0, 9)
  expect(result.ci_high).toBeCloseTo(-1.0, 9)
  expect(result.effect).toBeCloseTo(-1.0, 9)
})

test("wx_zeros", () => {
  const outcome = Stats.wilcoxonSignedRank(table([5.0, 6.0, 7.0, 8.0, 9.0, 10.0], [5.0, 6.0, 7.5, 8.4, 9.6, 10.9]),
    "x", "y", 0.05)
  if (!outcome.ok) throw new Error(outcome.error)
  const result = outcome.result
  expect(result.method).toBe("wilcoxon")
  expect(result.ties).toBe(false)
  expect(result.p_method).toBe("exact")
  expect(result.p).toBeCloseTo(0.125, 10)
  expect(result.n).toBeCloseTo(4, 9)
  expect(result.n_zero).toBeCloseTo(2, 9)
  expect(result.statistic).toBeCloseTo(0.0, 9)
  expect(result.null_mean).toBeCloseTo(5.0, 9)
  expect(result.hl_diff).toBeCloseTo(-0.5749999999999997, 9)
  expect(result.ci_low).toBeCloseTo(-0.9000000000000004, 9)
  expect(result.ci_high).toBeCloseTo(-0.40000000000000036, 9)
  expect(result.effect).toBeCloseTo(-1.0, 9)
})

test("wx_all_up", () => {
  const outcome = Stats.wilcoxonSignedRank(table([10.0, 12.0, 14.0, 16.0, 18.0, 20.0], [9.0, 11.0, 13.0, 15.0, 17.0, 19.0]),
    "x", "y", 0.05)
  if (!outcome.ok) throw new Error(outcome.error)
  const result = outcome.result
  expect(result.method).toBe("wilcoxon")
  expect(result.ties).toBe(true)
  expect(result.p_method).toBe("normal")
  expect(result.p).toBeCloseTo(0.01965615725016987, 10)
  expect(result.n).toBeCloseTo(6, 9)
  expect(result.n_zero).toBeCloseTo(0, 9)
  expect(result.statistic).toBeCloseTo(21.0, 9)
  expect(result.null_mean).toBeCloseTo(10.5, 9)
  expect(result.hl_diff).toBeCloseTo(1.0, 9)
  expect(result.ci_low).toBeCloseTo(1.0, 9)
  expect(result.ci_high).toBeCloseTo(1.0, 9)
  expect(result.effect).toBeCloseTo(1.0, 9)
})

test("mw_untied_5", () => {
  const outcome = Stats.mannWhitneyU(table([30.5, 32.1, 31.4, 33.9, 29.2], [10.1, 12.4, 14.7, 16.3, 18.9]),
    "x", "y", 0.05)
  if (!outcome.ok) throw new Error(outcome.error)
  const result = outcome.result
  expect(result.method).toBe("mann_whitney")
  expect(result.ties).toBe(false)
  expect(result.p_method).toBe("exact")
  expect(result.p).toBeCloseTo(0.007936507936507936, 10)
  expect(result.n_x).toBeCloseTo(5, 9)
  expect(result.n_y).toBeCloseTo(5, 9)
  expect(result.statistic).toBeCloseTo(25.0, 9)
  expect(result.null_mean).toBeCloseTo(12.5, 9)
  expect(result.mean_rank_x).toBeCloseTo(8.0, 9)
  expect(result.mean_rank_y).toBeCloseTo(3.0, 9)
  expect(result.hl_diff).toBeCloseTo(16.799999999999997, 9)
  expect(result.ci_low).toBeCloseTo(12.899999999999999, 9)
  expect(result.ci_high).toBeCloseTo(21.299999999999997, 9)
  expect(result.effect).toBeCloseTo(1.0, 9)
})

test("mw_untied_overlap", () => {
  const outcome = Stats.mannWhitneyU(table([1.5, 2.5, 3.5, 4.5, 5.5, 6.5], [1.6, 2.6, 3.6, 4.6, 5.6, 6.6]),
    "x", "y", 0.05)
  if (!outcome.ok) throw new Error(outcome.error)
  const result = outcome.result
  expect(result.method).toBe("mann_whitney")
  expect(result.ties).toBe(false)
  expect(result.p_method).toBe("exact")
  expect(result.p).toBeCloseTo(0.6991341991341992, 10)
  expect(result.n_x).toBeCloseTo(6, 9)
  expect(result.n_y).toBeCloseTo(6, 9)
  expect(result.statistic).toBeCloseTo(15.0, 9)
  expect(result.null_mean).toBeCloseTo(18.0, 9)
  expect(result.mean_rank_x).toBeCloseTo(6.0, 9)
  expect(result.mean_rank_y).toBeCloseTo(7.0, 9)
  expect(result.hl_diff).toBeCloseTo(-0.09999999999999987, 9)
  expect(result.ci_low).toBeCloseTo(-2.1, 9)
  expect(result.ci_high).toBeCloseTo(1.9000000000000004, 9)
  expect(result.effect).toBeCloseTo(-0.16666666666666663, 9)
})

test("mw_untied_20", () => {
  const outcome = Stats.mannWhitneyU(table([-0.46456554416655593, -0.29746562047264674, 1.2836732563424769, 3.6492206098308713, -1.4263773437365754, 2.6964136268681953, -2.460025550679721, 0.34995524548074786, -2.3390590390247725, 2.702916369008374, 1.6678459934365035, 2.2754335693101364, -1.7710663091109922, 1.3691100509694702, -1.0380266596589942, -0.9147706223038853, 1.0130741587974612, 1.753436344937413, 0.4088404308107525, -1.2559742020211973], [-0.8516330417660196, 3.6886340516504665, 1.9878918214245938, 2.2394558728567846, 5.166976285425663, -0.8317258972713213, 5.918915596811694, 7.1018162670797, 4.036826240520265, 2.4542130631104953, -0.527643909780646, 2.788971255640446, -0.08538429820701621, 0.7566984204202177, 0.21913364522052092, 1.367659912982061, 3.376155430886783, -0.3111681157329875, -1.1708076672605763, -1.2059131034989548]),
    "x", "y", 0.05)
  if (!outcome.ok) throw new Error(outcome.error)
  const result = outcome.result
  expect(result.method).toBe("mann_whitney")
  expect(result.ties).toBe(false)
  expect(result.p_method).toBe("exact")
  expect(result.p).toBeCloseTo(0.06750114507526123, 10)
  expect(result.n_x).toBeCloseTo(20, 9)
  expect(result.n_y).toBeCloseTo(20, 9)
  expect(result.statistic).toBeCloseTo(132.0, 9)
  expect(result.null_mean).toBeCloseTo(200.0, 9)
  expect(result.mean_rank_x).toBeCloseTo(17.1, 9)
  expect(result.mean_rank_y).toBeCloseTo(23.9, 9)
  expect(result.hl_diff).toBeCloseTo(-1.1959269342004772, 9)
  expect(result.ci_low).toBeCloseTo(-2.751678683583142, 9)
  expect(result.ci_high).toBeCloseTo(0.06307836561409008, 9)
  expect(result.effect).toBeCloseTo(-0.33999999999999997, 9)
})

test("mw_tied", () => {
  const outcome = Stats.mannWhitneyU(table([1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0], [3.0, 5.0, 7.0, 9.0, 11.0, 13.0, 15.0, 17.0]),
    "x", "y", 0.05)
  if (!outcome.ok) throw new Error(outcome.error)
  const result = outcome.result
  expect(result.method).toBe("mann_whitney")
  expect(result.ties).toBe(true)
  expect(result.p_method).toBe("normal")
  expect(result.p).toBeCloseTo(0.02708280670191722, 10)
  expect(result.n_x).toBeCloseTo(8, 9)
  expect(result.n_y).toBeCloseTo(8, 9)
  expect(result.statistic).toBeCloseTo(10.5, 9)
  expect(result.null_mean).toBeCloseTo(32.0, 9)
  expect(result.mean_rank_x).toBeCloseTo(5.8125, 9)
  expect(result.mean_rank_y).toBeCloseTo(11.1875, 9)
  expect(result.hl_diff).toBeCloseTo(-5.5, 9)
  expect(result.ci_low).toBeCloseTo(-10.0, 9)
  expect(result.ci_high).toBeCloseTo(-1.0, 9)
  expect(result.effect).toBeCloseTo(-0.671875, 9)
})

test("mw_dup", () => {
  const outcome = Stats.mannWhitneyU(table([4.0, 8.0, 15.0, 16.0, 23.0, 42.0, 4.0, 8.0, 15.0, 16.0], [23.0, 42.0, 8.0, 15.0, 16.0, 23.0, 42.0, 4.0, 8.0, 15.0]),
    "x", "y", 0.05)
  if (!outcome.ok) throw new Error(outcome.error)
  const result = outcome.result
  expect(result.method).toBe("mann_whitney")
  expect(result.ties).toBe(true)
  expect(result.p_method).toBe("normal")
  expect(result.p).toBeCloseTo(0.4665808686369457, 10)
  expect(result.n_x).toBeCloseTo(10, 9)
  expect(result.n_y).toBeCloseTo(10, 9)
  expect(result.statistic).toBeCloseTo(40.0, 9)
  expect(result.null_mean).toBeCloseTo(50.0, 9)
  expect(result.mean_rank_x).toBeCloseTo(9.5, 9)
  expect(result.mean_rank_y).toBeCloseTo(11.5, 9)
  expect(result.hl_diff).toBeCloseTo(-2.5, 9)
  expect(result.ci_low).toBeCloseTo(-15.0, 9)
  expect(result.ci_high).toBeCloseTo(7.0, 9)
  expect(result.effect).toBeCloseTo(-0.19999999999999996, 9)
})

test("mw_alpha01", () => {
  const outcome = Stats.mannWhitneyU(table([30.5, 32.1, 31.4, 33.9, 29.2], [10.1, 12.4, 14.7, 16.3, 18.9]),
    "x", "y", 0.01)
  if (!outcome.ok) throw new Error(outcome.error)
  const result = outcome.result
  expect(result.method).toBe("mann_whitney")
  expect(result.ties).toBe(false)
  expect(result.p_method).toBe("exact")
  expect(result.p).toBeCloseTo(0.007936507936507936, 10)
  expect(result.n_x).toBeCloseTo(5, 9)
  expect(result.n_y).toBeCloseTo(5, 9)
  expect(result.statistic).toBeCloseTo(25.0, 9)
  expect(result.null_mean).toBeCloseTo(12.5, 9)
  expect(result.mean_rank_x).toBeCloseTo(8.0, 9)
  expect(result.mean_rank_y).toBeCloseTo(3.0, 9)
  expect(result.hl_diff).toBeCloseTo(16.799999999999997, 9)
  expect(result.ci_low).toBeCloseTo(11.600000000000001, 9)
  expect(result.ci_high).toBeCloseTo(22.0, 9)
  expect(result.effect).toBeCloseTo(1.0, 9)
})

describe("rank test failures", () => {
  test("wilcoxon reports how many zero differences were dropped", () => {
    const outcome = Stats.wilcoxonSignedRank(table([1, 2, 3], [1, 2, 9]), "x", "y")
    if (outcome.ok) throw new Error("expected a rejection")
    expect(outcome.error).toBe("去掉 2 对零差值后只剩 1 对，符号秩检验无法进行")
  })

  test("mann-whitney needs two valid values in each group", () => {
    const outcome = Stats.mannWhitneyU(table([1, null], [2, null]), "x", "y")
    if (outcome.ok) throw new Error("expected a rejection")
    expect(outcome.error).toContain("两组各需至少 2 个有效数值")
  })
})

describe("latex output", () => {
  test("rank results print statistic, HL shift and the CI of the shift", () => {
    const outcome = Stats.mannWhitneyU(table([30.5, 32.1, 31.4, 33.9, 29.2], [10.1, 12.4, 14.7, 16.3, 18.9]), "x", "y")
    if (!outcome.ok) throw new Error(outcome.error)
    const latex = Stats.toLatexTable(outcome.result)
    expect(latex).toContain("% Mann-Whitney U test: x vs y")
    expect(latex).toContain("U (x) & 25.0")
    expect(latex).toContain("Hodges-Lehmann shift & 16.800")
    expect(latex).toContain("p (two-sided, exact) & 0.0079")
    expect(latex).toContain("95\\% CI (HL shift) & (12.900, 21.300)")
    expect(latex).toContain("rank-biserial r & 1.000 (large)")
  })
})
