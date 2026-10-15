---
name: latex-troubleshoot
description: LaTeX 编译失败的系统排查流程。当 latex_compile 返回 error 且直接修复无效时使用，覆盖宏包缺失、未定义控制序列、数学模式、引用未解析、字体与图片路径等常见故障类别。
---

# LaTeX 编译排错流程

按以下顺序排查，每步修复后重新运行 `latex_compile` 验证：

## 方法论

1. **先修第一个 error**：读取结构化诊断数组的首条（file+line+message）。后续错误大多是第一个错误的级联产物，修一个消一片。
2. **用行号定位，通读上下文**：跳到诊断给出的文件与行号，读前后 10 行再动手；行号不准时（常见于环境未闭合），向上找最近的 `\begin` 或未闭合结构。
3. **一次只修一类问题**：修完重新编译看诊断变化，不猜测性大面积重写。

## 常见错误模式对照表

| 诊断特征 | 故障类别 | 排查与修复 |
| --- | --- | --- |
| `File 'xxx.sty' not found` / `File 'xxx.cls' not found` | 宏包/文档类缺失 | Tectonic 应能联网下载 bundle，确认网络；本地 `.sty/.cls` 必须在项目内且被 `\usepackage` 正确引用（相对 main_file 目录） |
| `Undefined control sequence` | 未定义控制序列 | 多为命令拼写错误或缺宏包：先确认命令名，再确认对应宏包已 `\usepackage`；自定义命令检查 `\newcommand` 是否在使用之前 |
| `Missing $ inserted` / `Display math should end with $$` | 数学模式错误 | 行内公式用 `$...$` 或 `\(...\)`；检查环境内 `_` `^` 等必须处于数学模式的字符；`\[` 与 `\]`、`begin/end equation` 必须配对 |
| `Citation 'xxx' undefined` | 引用未解析 | 用 format_check 的 `missing-cite-key` 思路核对 `.bib` 中 key 拼写；确认 `\bibliography{...}` 指向的 .bib 存在；新增 bib 条目后需重新编译 |
| `Reference 'xxx' undefined` | 交叉引用未解析 | 检查 `\ref` 的 key 是否有对应 `\label`（format_check 的 `undefined-ref`）；label 定义在 ref 之后时需再编译一遍 |
| 字体相关（`fontspec` error、`Font ... not found`） | 字体缺失 | Tectonic 默认走 bundle 字体；`\setmainfont` 引用的系统字体需已安装，否则改用 bundle 内字体 |
| `\includegraphics` 的 `File not found` | 图片路径错误 | 相对路径以 main_file 所在目录为基准，不是以当前被 `\input` 的文件为基准 |
| `Overfull/Underfull \hbox` | 排版警告 | 通常不阻塞编译；需要处理时调整断词（`\-`）、`\sloppy` 或改写长行 |
| `Environment xxx undefined` / `\begin{...}` 与 `\end{...}` 不匹配 | 环境未闭合或未定义 | 配对所有 `\begin/\end`（format_check 的 unbalanced-braces 只能查花括号，环境配对靠肉眼+缩进）；未定义环境补宏包 |

## 仍失败时

完整阅读 `.researchos/latex/build/<main>.log` 中首个 `!` 行前后 20 行，提取真实上下文后再修；Tectonic 缺失（compile 返回 `available: false`）时按返回的 installHint 安装，不要假装编译成功。

输出格式：故障类别 / 根因 / 修复 diff / 重新编译结果。
