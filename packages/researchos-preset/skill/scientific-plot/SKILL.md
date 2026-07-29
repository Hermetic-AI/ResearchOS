---
name: scientific-plot
description: 科研绘图规范：选择统计图模板、执行显著性检验、应用 Nature/Science/IEEE 主题并检查出版级导出。
---

# 科研绘图规范

## 模板选择

- 分组均值及误差：grouped_bar，默认 SEM。
- 完整分布：boxplot 或 violin；小样本优先展示散点。
- 两个连续变量：scatter_regression，默认 95% 置信带。
- 时间事件：survival（Kaplan–Meier）。
- 数值矩阵或相关矩阵：heatmap，发散色板中心为 0。

## 显著性

`*` 表示 p < 0.05，`**` 表示 p < 0.01，`***` 表示 p < 0.001，其余为 `ns`。
两组默认 Welch t-test；分布假设不满足时用 Mann–Whitney；多组先做 ANOVA。不得推测或编造 p 值。

## 交付检查

1. 论文插图优先 PDF 矢量格式，位图至少 300 DPI。
2. 图中的最小字号在最终排版尺寸下仍可读。
3. 轴标签含变量名与单位，颜色在灰度打印和常见色觉缺陷下可区分。
4. 保留 spec.json、data.csv 和 chart.py，确保结果可复现。
5. 插入论文时使用 `fig:` label，并确认 caption 能独立解释图意。
