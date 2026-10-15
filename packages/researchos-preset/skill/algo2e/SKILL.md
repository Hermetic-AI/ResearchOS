---
name: algo2e
description: 把源代码片段提炼为 Algorithm2e 伪代码 LaTeX。当用户要求"把这段代码写成算法伪代码""生成 Algorithm2e"时使用。
---

# 代码 → Algorithm2e 伪代码转换方法论

## 输入与前置

输入：源文件路径（+ 可选函数名）。先用 OpenCode 原生读文件工具读代码，**只承诺单函数粒度**；长文件先按函数切分再逐个转换。

## 提炼步骤

1. **识别算法要素**：从函数体里找出输入（参数与外部状态）、输出（返回值与副作用）、主流程（初始化 → 循环 → 终止条件 → 返回）。
2. **剥离语言细节**：删除类型标注、import/require、日志、异常处理的语法噪音、getter/setter 样板；保留影响算法语义的边界条件与早退分支。
3. **映射到 Algorithm2e 语法要素**：

   | 代码结构 | Algorithm2e |
   | --- | --- |
   | 函数参数 / 外部输入 | `\KwIn{...}` |
   | 返回值 / 产出 | `\KwOut{...}` 或 `\KwRet{...}` |
   | for 循环 | `\For{$i \leftarrow 1$ \KwTo $n$}{...}` |
   | while / 条件循环 | `\While{condition}{...}` |
   | for-each | `\ForEach{item $\in$ set}{...}` |
   | if / else if / else | `\uIf{...}{...} \uElseIf{...}{...} \Else{...}` |
   | 赋值 | `$x \leftarrow expr$` |
   | return | `\Return{...}` |
   | 并行/并发结构 | 注释行 `\tcp*{...}` 说明，不虚构语法 |

4. **逐行写伪代码**：每个有意义的操作一行，数学化表达（下标、集合符号）；循环体与条件体保持缩进层级，禁止把多个操作挤在一行。

## 命名与环境规范

- 外层包 `\begin{algorithm}[htbp]` + `\caption{...}` + `\label{alg:<kebab-name>}`；caption 用动词短语（如 "Beam Search Decoding"）。
- 变量名保留代码原名的语义但数学化（`hiddenState` → $h_t$ 时在首次出现处注释映射）。
- 环境依赖 `algorithm2e` 宏包，输出前检查目标文档是否已引入；没有则在交付说明里提示，不擅自改用户的 preamble。

## 输出要求

- 只输出纯 LaTeX 片段，不带 markdown fence、不带解释文字。
- 交付形式为**候选片段供 diff review**：由调用方（paper-writer SubAgent 或用户）决定插入位置与是否采纳，绝不静默写入 `.tex` 文件。
- 拿不准语义的步骤用 `\tcp*{unclear: ...}` 标出而不是编造。
