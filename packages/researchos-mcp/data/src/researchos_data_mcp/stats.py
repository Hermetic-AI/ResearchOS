"""data.stat_test: scipy dispatch, effect sizes, conclusion template."""

import numpy as np
import pandas as pd
from scipy import stats as scipy_stats

TEST_NAMES = {
    "ttest": "独立样本 t 检验",
    "mannwhitney": "Mann-Whitney U 检验",
    "anova": "单因素方差分析（ANOVA）",
    "kruskal": "Kruskal-Wallis 检验",
    "chi2": "卡方独立性检验",
    "shapiro": "Shapiro-Wilk 正态性检验",
    "pearson": "Pearson 相关",
    "spearman": "Spearman 等级相关",
}


def _numeric(frame: pd.DataFrame, column: str) -> np.ndarray:
    if column not in frame.columns:
        raise ValueError(f"unknown column: {column}")
    return pd.to_numeric(frame[column], errors="coerce").dropna().to_numpy(dtype=float)


def _groups(frame: pd.DataFrame, value_col: str, group_col: str) -> list[np.ndarray]:
    if group_col not in frame.columns:
        raise ValueError(f"unknown column: {group_col}")
    return [
        pd.to_numeric(group[value_col], errors="coerce").dropna().to_numpy(dtype=float)
        for _, group in frame.groupby(group_col)
    ]


def cohens_d(a: np.ndarray, b: np.ndarray) -> float:
    pooled = np.sqrt(((len(a) - 1) * a.std(ddof=1) + (len(b) - 1) * b.std(ddof=1)) / max(1, len(a) + len(b) - 2))
    return float((a.mean() - b.mean()) / pooled) if pooled > 0 else 0.0


def eta_squared(groups: list[np.ndarray]) -> float:
    all_values = np.concatenate(groups)
    grand = all_values.mean()
    between = sum(len(group) * (group.mean() - grand) ** 2 for group in groups)
    total = float(((all_values - grand) ** 2).sum())
    return float(between / total) if total > 0 else 0.0


def cramers_v(table: np.ndarray, chi2: float) -> float:
    n = table.sum()
    return float(np.sqrt(chi2 / max(1, n * (min(table.shape) - 1)))) if n > 0 else 0.0


def run_test(frame: pd.DataFrame, test: str, columns: list[str], params: dict) -> dict:
    if test not in TEST_NAMES:
        raise ValueError(f"unsupported test: {test}")
    if test == "ttest":
        groups = _groups(frame, columns[0], params["group_col"]) if params.get("group_col") else [
            _numeric(frame, column) for column in columns[:2]
        ]
        if len(groups) != 2:
            raise ValueError("ttest needs exactly two groups (two columns or group_col with two levels)")
        equal_var = bool(params.get("equal_var", True))
        result = scipy_stats.ttest_ind(groups[0], groups[1], equal_var=equal_var)
        return {"statistic": float(result.statistic), "p_value": float(result.pvalue),
                "effect_name": "Cohen's d", "effect": cohens_d(groups[0], groups[1])}
    if test == "mannwhitney":
        groups = _groups(frame, columns[0], params["group_col"]) if params.get("group_col") else [
            _numeric(frame, column) for column in columns[:2]
        ]
        if len(groups) != 2:
            raise ValueError("mannwhitney needs exactly two groups")
        a, b = groups
        result = scipy_stats.mannwhitneyu(a, b)
        return {"statistic": float(result.statistic), "p_value": float(result.pvalue),
                "effect_name": "rank-biserial", "effect": 1.0 - 2.0 * float(result.statistic) / max(1, len(a) * len(b))}
    if test in ("anova", "kruskal"):
        groups = _groups(frame, columns[0], params["group_col"]) if params.get("group_col") else [
            _numeric(frame, column) for column in columns
        ]
        result = scipy_stats.f_oneway(*groups) if test == "anova" else scipy_stats.kruskal(*groups)
        return {"statistic": float(result.statistic), "p_value": float(result.pvalue),
                "effect_name": "eta^2", "effect": eta_squared(groups)}
    if test == "chi2":
        if len(columns) != 2:
            raise ValueError("chi2 needs exactly two categorical columns")
        table = pd.crosstab(frame[columns[0]], frame[columns[1]]).to_numpy()
        chi2, p_value, _, _ = scipy_stats.chi2_contingency(table)
        return {"statistic": float(chi2), "p_value": float(p_value),
                "effect_name": "Cramér's V", "effect": cramers_v(table, float(chi2))}
    if test == "shapiro":
        result = scipy_stats.shapiro(_numeric(frame, columns[0]))
        return {"statistic": float(result.statistic), "p_value": float(result.pvalue),
                "effect_name": "", "effect": 0.0}
    x, y = _numeric(frame, columns[0]), _numeric(frame, columns[1])
    result = scipy_stats.pearsonr(x, y) if test == "pearson" else scipy_stats.spearmanr(x, y)
    return {"statistic": float(result.statistic), "p_value": float(result.pvalue),
            "effect_name": "r", "effect": float(result.statistic)}


def conclude(test: str, result: dict, alpha: float = 0.05) -> str:
    significant = result["p_value"] < alpha
    verdict = "拒绝" if significant else "不能拒绝"
    effect = (
        f"，效应量 {result['effect_name']}={result['effect']:.3f}" if result["effect_name"] else ""
    )
    return (
        f"{TEST_NAMES[test]}: 统计量={result['statistic']:.4g}, p={result['p_value']:.4g}；"
        f"{verdict}原假设（α={alpha}）{effect}"
    )
