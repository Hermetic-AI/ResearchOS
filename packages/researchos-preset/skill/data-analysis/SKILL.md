---
name: data-analysis
description: Select and report scientific statistical tests and organize reproducible analysis notebooks. Use when a task involves hypothesis testing, p-value interpretation, effect sizes, experimental data analysis, or notebook workflow design.
---

# Scientific Data Analysis

## Workflow

1. Profile the dataset before testing. Report schema, missingness, duplicates, constants, and material outliers.
2. Keep one operation per notebook cell in this order: load, profile, clean, test, chart, link artifact.
3. Preserve raw data. Write derived files and figures under `.researchos/` with enough parameters to replay them.

## Test selection

- Two independent groups: check normality; use Welch t-test for approximately normal unequal-variance data, otherwise Mann-Whitney U.
- Three or more groups: use ANOVA when assumptions hold, otherwise Kruskal-Wallis. State required post-hoc testing.
- Categorical association: use chi-square; warn when expected counts are too small and consider Fisher's exact test.
- Continuous association: use Pearson for suitable approximately normal linear relationships, otherwise Spearman.
- Paired measurements must use paired methods through `run_python`; never treat them as independent samples.

## Reporting

Always report the test, statistic, p-value, alpha, effect size, sample size, assumption checks, and limitations. Say "not statistically significant" for p >= alpha; never claim this proves no effect. Flag multiple-comparison correction when relevant.

Use `data.chart` for publication artifacts and call `data.link_experiment` for every figure entering a paper.
