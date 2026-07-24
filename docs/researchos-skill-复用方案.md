# ResearchOS 能力盘点与 Skill 复用方案

> 基于 `docs/` 下的三套技术方案（ResearchOS最终方案 / Gemini 设计 / GPT 设计）与 `docs/skills/` 下 10 个开源科研 skill 目录（共 700+ skill）做的能力对照分析。

---

## 一、ResearchOS「已规划的内置功能」清单

依据《ResearchOS最终方案.md》（8 个模块）+ Gemini/GPT 方案对照，确定平台「开箱即用」的内置能力：

| 模块 | 内置功能 | 文档位置 |
|---|---|---|
| 1. 文献管理中心 | arXiv/SS/Crossref/PubMed 搜索、Zotero DB 导入、PDF 元数据提取、GROBID 引用抽取、BibTeX/RIS/EndNote 互转、6 种引文格式输出、相似文献推荐 | 最终方案 §模块一 |
| 2. 知识图谱 | `[[]]` 双链解析、节点/边存储、力导向图、Graph RAG、AI 自动建链 | 最终方案 §模块二 |
| 3. LaTeX 编辑器 | Monaco + Tectonic 编译 + SyncTeX 跳转、格式校验 | 最终方案 §模块三 |
| 4. 数据分析 | Python 沙盒（NumPy/Pandas/SciPy/sklearn）、Matplotlib/Seaborn/Plotly 出图、Optuna 参数优化、commit-论文章节关联 | 最终方案 §模块四 |
| 5. 论文写作 | 标题生成、结构骨架、学术润色、Algorithm2e 伪代码抽取、Markdown↔LaTeX、引用推荐 | 最终方案 §模块五 |
| 6. 复现 | paper + GitHub → clone → 分析 → 环境 → 运行 → 比对（不侵入内核） | 最终方案 §模块六 |
| 7. 科研绘图 | 4 模式：Prism 级统计图 / Origin 数据画布 / draw.io 流程图 / Mermaid-Graphviz-PlantUML、TikZ 导出、期刊主题 | 最终方案 §模块七 |
| 8. Agent 资产管理 | Skill/MCP/SubAgent/Model/Command/Rules/Hook 统一管理面板 | 最终方案 §模块八 |

加上 OpenCode 原生：CLI/Web/Desktop、Tool Calling、MCP、GitHub 连接、Repo 理解。

---

## 二、Skill 资源全景（10 个目录，约 700+ 个 skill）

按主题域分类（只列关键 skill，不全列）：

| 目录 | 主题 | 数量级 | 核心代表 |
|---|---|---|---|
| **AI-Research-SKILLs** | AI/ML 工程（训练/推理/评估/部署） | ~131 | `autoresearch`（两环路自主研究）、`litgpt`、`mamba`、`rwkv`、`torchtitan`、`huggingface-tokenizers`、`llama-factory`、`peft`、`unsloth`、`trl-fine-tuning`、`verl`、`accelerate`、`deepspeed`、`megatron-core`、`flash-attention`、`llama-cpp`、`lm-evaluation-harness` |
| **Auto-Empirical-Research-Skills** | 实证研究全流程（中文向） | ~220 | 编排器 `auto-empirical-research-skills`、9 阶段文档（选题→检索→阅读→数据→统计→写作→修改→引用→复现） |
| **academic-research-skills** | 学术写作与研究流水线 | ~316 | `academic-pipeline`（10 阶段编排）、`academic-paper`（12-agent 写作）、`academic-paper-reviewer`（5 评审 + Devil's Advocate）、`deep-research`（13-agent 5 模式）、`literature-review`、`statistical-analysis` |
| **PaperSpine** | 论文骨架（端到端） | 5 | `paper-spine` 入口 + 拆解/漫画/PPT 模板 |
| **deep-research** | 深度研究 | 2 | `deep-research` 流程文档 |
| **literature_review** | 综述 | 1 | `literature-review` |
| **nature-skills** | Nature 期刊向（中文） | ~61 | `nature-academic-search`（含 MCP Server）、`nature-citation`、`nature-data`、`nature-downloader`、`nature-experiment-log`、`nature-figure`、`nature-paper2ppt`、`nature-polishing`、`nature-proposal-writer`、`nature-reader`、`nature-reviewer`、`nature-statistics`、`nature-writing` |
| **paper-craft-skills** | 论文可视化 | 12 | `paper-analyzer`、`paper-comic`、`paper-deck` |
| **research-hub** | Zotero-AI 增强 | 12 | `research-hub`（主入口）、`research-context-compressor`、`research-design-helper`、`research-project-orienter`、`literature-triage-matrix`、`paper-summarize`、`paper-memory-builder`、`gap-to-topic`、`zotero-library-curator`、批 NotebookLM `notebooklm-brief-verifier` |
| **scientific-agent-skills** | 科学计算专项库（核心） | ~298 | 涵盖天文/单细胞/基因/化学/物理/材料/医学/遥感/实验机器人等多学科工具包（`scanpy`、`anndata`、`scikit-bio`、`pymc`、`rdkit`、`astropy`、`pennylane`、`qiskit`、`biopython`、`pymatgen`、`pydicom`、`dask`、`polars`、`networkx`、`matplotlib`、`seaborn`、`sympy`、`scikit-learn`、`deeptools`、`hypogenic`、`hypothesis-generation`、`experimental-design`、`statistical-analysis`、`statistical-power`、`treatment-plans`、`clinical-decision-support`、`clinical-reports`、`phylogenetics`、`molecular-dynamics`、`autoskill`、`pi-agent`、`parallel-web`、`exa-search`、`hugging-science`、`gget`、`scholar-evaluation`、`venue-templates`、`research-grants`、`iso-13485-certification`、`labarchive-integration`、`benchling-integration`、`infographics`、`latex-posters`、`pptx`、`docx`、`xlsx`、`pdf`、`markitdown`、`markdown-mermaid-writing`、`what-if-oracle`） |

---

## 三、分流判定逻辑（核心结论）

建立两条筛选线：

- **C 线（平台内置候选）**：能"反向喂"ResearchOS 8 大模块、提升组件能力等级、构成"科研工作站"差异化护城河、无需用户按需安装的——→ **改为内置功能**。
- **S 线（直接挂 Skill Market）**：是某个特定学科/库/工作流的"工具包"，用户按需启用、不用就永远不装的——→ **Skill Market 货架**。

判定要诀：

> 如果它解决"任何研究方向都用得上" → 内置；
> 如果它解决"我做天文学才用、别人几乎不用" → 放 Skill Market。

---

## 四、建议转为「内置功能」的能力（高价值 C 线）

下面按与 ResearchOS 8 大模块的对应关系组织，每条都给出 **可吸收内容 / 改造方式 / 对应平台模块**：

### 4.1 文献 + 综述能力（喂模块 1）

| 吸收源 | 可吸收 | 平台落位 |
|---|---|---|
| `research-hub/research-hub` | Zotero 库结构化摄取（Obsidian-friendly notes、cited-papers 元数据、`.research/` 目录协议） | 模块 1 内置：兼容 Zotero 库导入、生成 `.research/` 结构 |
| `research-hub/research-design-helper` | 研究设计对话助手（Protocol.md 模板） | 模块 5 内置：实验设计 prompt 模板 |
| `research-hub/research-project-orienter` | 项目方向引导（5 问立项法） | 模块 1 内置：方向引导引导页 |
| `research-hub/literature-triage-matrix` | 论文比较矩阵生成（按方法/数据/局限性对比） | 模块 1 内置：多论文对比视图 |
| `research-hub/paper-summarize` | 论文自动摘要 → 写入 Obsidian + Zotero child note | 模块 1 内置：AI 论文阅读 |
| `research-hub/paper-memory-builder` | 把作者自己的稿件拆成 `claims.yml` + `figures.yml` | 模块 5 内置：写作素材库 |
| `research-hub/notebooklm-brief-verifier` | 群组阅读简报与原文逐句对照 | 模块 1 内置：阅读简报功能 |
| `research-hub/research-context-compressor` | 长上下文压缩、重排 | 模块 5 内置：上下文压缩 |
| `academic-research-skills/deep-research` | 13-agent 流水线、PRISMA 系统综述、Meta-analysis、3W literature scan、伦理审查 | 模块 1+5 内置：深度研究模式（高级选项） |
| `academic-research-skills/literature-review` | 综述写作 | 模块 1 内置：综述生成 |
| `academic-research-skills/statistical-analysis` | 统计方法选择 + 报告模板 | 模块 4 内置：统计检验向导 |
| `nature-skills/nature-academic-search` | **含 MCP Server 实现**（覆盖 CNKI/OA/publisher API）、完整中文学术搜索 | **强烈推荐** 取代模块 1 的 arXiv/SS 自研层 |
| `nature-skills/nature-citation` | 引用解析与格式化 | 模块 1 内置：引用生成后端 |
| `nature-skills/nature-ref-verifier` | 引用真实性核查（防 hallucination） | **强烈推荐** 新增内置能力：引用真实性 |
| `nature-skills/nature-reader` | 论文阅读（Soho 风格笔记） | 模块 1 内置：AI 阅读视图 |
| `nature-skills/nature-downloader` | 全文下载（CNKI 机构访问、OA 回退） | 模块 1 内置：PDF 合法下载 |
| `Auto-Empirical-Research-Skills` 全文 | 9 阶段实证研究通用流程（中文场景） | 模块 1-5 全部：作为"研究流程教学/约束"模板 |

### 4.2 写作 + 排版能力（喂模块 5）

| 吸收源 | 可吸收 | 平台落位 |
|---|---|---|
| `academic-research-skills/academic-paper` | **12-agent 写作流水线**（11 模式：full/plan/outline/revision/abstract/lit-review/format-convert/citation-check/disclosure/rebuttal-audit） | **强烈推荐** 取代模块 5 自研部分 |
| `academic-research-skills/academic-paper-reviewer` | 5 角色评审（EIC+3 reviewer+Devil's Advocate）、Socratic 评审 | 模块 5 内置：自审模式 |
| `academic-research-skills/academic-pipeline` | 10 阶段编排（research→write→integrity→review→revise→re-review→re-revise→final integrity→finalize） | **强烈推荐** 平台"研究项目"编排器的核心 |
| `nature-skills/nature-polishing` | Nature 风格润色（英文向） | 模块 5 内置：英文润色 |
| `nature-skills/nature-writing` | 写作规范 | 模块 5 内置：写作风格指南 |
| `nature-skills/nature-response` | 审稿意见回复（rebuttal） | 模块 5 内置：审稿回复模板 |
| `nature-skills/nature-reviewer` | 审稿人视角 mock | 模块 5 内置：投稿前自审 |
| `nature-skills/nature-proposal-writer` | 申请书写作 | 模块 5 内置：基金申请书模式 |
| `nature-skills/nature-paper-to-patent` | 论文→专利（衍生能力） | 模块 5 扩展：专利生成 |
| `PaperSpine/paper-spine` | 完整 Launchpad（intake → paper → rewrite） | 模块 5 内置：端到端论文生成入口 |

### 4.3 绘图 + 演示能力（喂模块 7）

| 吸收源 | 可吸收 | 平台落位 |
|---|---|---|
| `nature-skills/nature-figure` | Nature 期刊级图表规范 | 模块 7 内置：Nature 主题模板 |
| `nature-skills/nature-paper2ppt` | **Nature 期刊风 PPT 生成**（含完整 QA，做图裁切/对齐/中文表达去 AI 味） | 模块 7 内置：论文→PPT 演示 |
| `paper-craft-skills/paper-deck` | 论文→演示稿 | 模块 7 内置：演示稿生成 |
| `paper-craft-skills/paper-comic` | 论文→漫画（科普化） | 模块 7 扩展：科普图 |
| `paper-craft-skills/paper-analyzer` | 论文整体结构化分析 | 模块 5+7 共用：稿件结构化 |
| `scientific-agent-skills/scientific-visualization` | 学科可视化（替代部分 matplotlib 自研） | 模块 7 内置：高级可视化 |
| `scientific-agent-skills/scientific-slides` | 学术 Slide 场景模板 | 模块 7 内置：幻灯片模板 |
| `scientific-agent-skills/infographics` | 信息图 | 模块 7 内置：信息图 |
| `scientific-agent-skills/latex-posters` | LaTeX 海报 | 模块 7 内置：海报 |
| `scientific-agent-skills/scientific-schematics` | 示意图（架构/系统） | 模块 7 内置：示意图生成 |
| `scientific-agent-skills/markdown-mermaid-writing` | Markdown + Mermaid 写作 | 模块 7 内置：图即文档 |

### 4.4 数据分析 + 统计（喂模块 4）

| 吸收源 | 可吸收 | 平台落位 |
|---|---|---|
| `scientific-agent-skills/statistical-analysis` | 统计方法选择 + 模板 | 模块 4 内置：分析向导 |
| `scientific-agent-skills/statistical-power` | 统计功效分析 | 模块 4 内置：功效计算 |
| `scientific-agent-skills/experimental-design` | 实验设计（hypothesis-driven） | 模块 4 内置：实验设计 |
| `scientific-agent-skills/exploratory-data-analysis` | EDA 流程 | 模块 4 内置：EDA 工作流 |
| `scientific-agent-skills/hypothesis-generation` | 假设生成 | 模块 4+5 内置：假设-验证循环 |
| `scientific-agent-skills/treatment-plans` | 处理方案 | 模块 4 内置：实验变量 |
| `scientific-agent-skills/what-if-oracle` | 反事实分析 | 模块 4 内置：因果推演 |
| `nature-skills/nature-statistics` | 统计方法（中文场景） | 模块 4 内置：中文统计规范 |
| `nature-skills/nature-data` | Nature 数据规范 | 模块 4 内置：数据规整模板 |
| `scientific-agent-skills/research-lookup` | Web 学术搜索（参考） | 模块 1 配合 |
| `nature-skills/nature-experiment-log` | **实验日志标准模板**（YAML frontmatter + Obsidian） | 模块 4 内置：实验日志 |

### 4.5 知识图谱 + 资产管理（喂模块 2、8）

| 吸收源 | 可吸收 | 平台落位 |
|---|---|---|
| `research-hub/research-hub` | `.research/` 目录协议、Zotero-Obsidian 双向链接 | 模块 2 内置：obsidian 兼容 |
| `research-hub/gap-to-topic` | 研究空白决策（3-gate verdict） | 模块 2 内置：选题评估 |
| `research-hub/research-context-compressor` | 上下文压缩 | 模块 1+5 共用 |
| `academic-research-skills/peer-review` | 审稿维度（补 4.2） | 模块 5 内置 |
| `scientific-agent-skills/auto-empirical-research-skills` 编排思路 | Auto-Empirical 9 阶段 | 模块 8 编排器 |
| `research-hub/research-hub-multi-ai` | 多 AI 协作（Claude/Codex/Copilot） | 模块 8：跨工具兼容 |
| `scientific-agent-skills/autoskill` | 屏幕观察 → 自动生成新 skill | 模块 8 内置：skill 自生长 |

### 4.6 端到端能力（喂整个产品定位）

| 吸收源 | 可吸收 | 平台落位 |
|---|---|---|
| `AI-Research-SKILLs/0-autoresearch-skill` | **两环路自主研究流水线**（inner loop 快速实验，outer loop 综述） | **强烈推荐** 产品核心：研究项目调度器 |
| `academic-research-skills/academic-pipeline` | 10 阶段端到端流水线 | 模块 8：项目编排 |
| `PaperSpine/paper-spine` | 论文端到端生成 | 模块 5：端到端入口 |

---

## 五、建议直接挂「Skill Market」的能力（高价值 S 线）

按学科 / 工具包聚合分配到 Skill Market 的预设分组（这些不是放一个文件夹，而是要建分组）：

### 5.1 学科工具包（按领域开货架）

| 预置分组 | 包含 skill | 触发场景 |
|---|---|---|
| **生命科学 / 单细胞** | `scanpy`、`anndata`、`scvi-tools`、`cellxgene-census`、`pydeseq2`、`bulk-rnaseq`、`scvelo`、`polars-bio`、`gget`、`primekg`、`biopython`、`pysam`、`tiledbvcf`、`pathml` | "我现在做单细胞" |
| **基因组 / 测序** | `deeptools`、`arboreto`、`geniml`、`gtars`、`pathway-enrichment`、`dhdna-profiler`、`benchling-integration`、`pacsomatic`、`pyhealth` | "测序数据处理" |
| **化学 / 分子** | `rdkit`、`medchem`、`molfeat`、`pytdc`、`deepchem`、`diffdock`、`datamol`、`glycoengineering` | "化学/分子生成" |
| **材料 / 物理** | `pymatgen`、`pennylane`、`qutip`、`sympy`、`astropy`、`fluidsim`、`molecular-dynamics` | "材料计算/物理仿真" |
| **医学 / 临床** | `clinical-decision-support`、`clinical-reports`、`treatment-plans`、`iso-13485-certification`、`neurokit2`、`pydicom`、`histolab`、`pyhealth` | "临床研究" |
| **量子** | `cirq`、`qiskit`、`pennylane` | "量子计算" |
| **实验机器人** | `opentrons-integration`、`pylabrobot`、`protocolsio-integration`、`labarchive-integration`、`latchbio-integration`、`omero-integration`、`ginkgo-cloud-lab`、`adaptyv`、`benchling-integration` | "湿实验自动化" |
| **地理 / 遥感** | `geopandas`、`imaging-data-commons`、`pathml` | "GIS/遥感" |
| **机器学习工具栈** | `polars`、`dask`、`matplotlib`、`seaborn`、`scikit-learn`、`pytorch-lightning`、`transformers`、`hugging-science`、`optimize-for-gpu`、`shap`、`vaex`、`accelerate` | "ML 工程师视角" |
| **统计分析专项** | `statsmodels`、`pymc`、`networkx`、`scikit-bio`、`scikit-survival`、`pymoo`、`simpy` | "统计与建模" |

### 5.2 AI 训练 / 推理部署（AI-Research-SKILLs 主体）

| 分组 | 典型 skill |
|---|---|
| **模型架构** | `litgpt`、`mamba`、`nanogpt`、`rwkv`、`torchtitan` |
| **Tokenizer** | `huggingface-tokenizers`、`sentencepiece` |
| **微调** | `llama-factory`、`peft`、`axolotl`、`unsloth` |
| **RLHF / 后训练** | `trl-fine-tuning`、`openrlhf`、`verl`、`slime`、`torchforge`、`miles`、`grpo-rl-training`、`simpo` |
| **可解释性** | `transformer-lens`、`nnsight`、`pyvene`、`saelens` |
| **数据处理** | `nemo-curator`、`ray-data` |
| **安全对齐** | `constitutional-ai`、`llamaguard`、`nemo-guardrails`、`prompt-guard` |
| **分布式训练** | `accelerate`、`deepspeed`、`megatron-core`、`pytorch-fsdp2`、`pytorch-lightning`、`ray-train` |
| **云基础设施** | `lambda-labs`、`modal`、`skypilot` |
| **量化 / 推理加速** | `awq`、`bitsandbytes`、`flash-attention`、`gguf`、`gptq`、`hqq`、`llama-cpp` |
| **评估 Benchmark** | `lm-evaluation-harness`、`bigcode-evaluation-harness`、`nemo-evaluator` |
| **自主研究** | `autoresearch`（已在 4.6 列为内置） |

> 这一组 60+ 个 skill 是 **AI/ML 研究员的"工具库"**，建议做成 "**AI Research Toolbox**" 集合包一键安装。

### 5.3 通用文档 / 科研工程工具

| 单挂 skill | 用途 |
|---|---|
| `pdf` / `docx` / `xlsx` / `pptx` / `pptx-posters` | 文档读写 |
| `markitdown` | 文档转换 |
| `pi-agent` | 代理调度 |
| `exa-search` / `parallel-web` | 深度 Web 搜索 |
| `database-lookup` | 数据库查询 |
| `markdown-mermaid-writing` | Markdown/Mermaid 写作（已在 4.3 内置部分） |
| `consciousness-council` / `scholar-evaluation` / `scientific-critical-thinking` / `scientific-brainstorming` | 评审/思维类 |
| `research-grants` | 基金申请 |
| `venue-templates` | 期刊模板库 |
| `infographics` | 信息图（已在 4.3 部分） |
| `what-if-oracle` | 已在 4.4 内置 |

> **拿捏**：通用工具包（pdf/docx/pptx/xlsx）这类在 OpenCode/Claude Code 已经默认存在的，**不挂 Market**（避免重复）；仅当 ResearchOS 用户特别需要的科研变体（**scientific-slides**、**latex-posters**、**infographics**、**scientific-schematics**）才挂。

### 5.4 数据获取专项

| skill | 用途 |
|---|---|
| `paper-lookup` | 10 个学术 API 联合搜索 |
| `paperzilla` | 论文爬虫 |
| `bgpt-paper-search` | bioRxiv 搜索 |
| `pyzotero` | Zotero 操作（与 4.1 内置区别：作为底层库） |
| `usfiscaldata` / `market-research-reports` | 财经/市场数据 |
| `tamarind` | 论文 AI 助理 |
| `pufferlib` | RL 训练 |

---

## 六、灰色地带处理建议

| skill | 建议归属 | 理由 |
|---|---|---|
| `nature-academic-search` | **4.1 内置**（重点） | MCP Server 实现完备，覆盖中文+全球，覆盖 arXiv/SS 自研窄 |
| `nature-polishing` | **4.2 内置** | 任何英文学术写作都用 |
| `nature-reviewer` / `nature-response` | **4.2 内置** | 写作收尾阶段刚需 |
| `nature-paper-to-patent` / `nature-paper2ppt` | **4.2/4.3 内置** | 论文衍生品（专利/PPT）这两条是产物级别 |
| `experimental-design` / `hypothesis-generation` | **4.4 内置** | 实验模块核心 |
| `clinical-decision-support` | **5.1 医学分组** | 不属于通用核心 |
| `dask` / `polars` / `matplotlib` 等通用 ML 库 | **5.1 ML 工具栈** | 通用但属于"工具包" |
| `consciousness-council` / `scholar-evaluation` | **5.3 单挂** | 提效型，少数人用 |
| `autoskill` | **4.5 内置** | 让 Skill Market 自生长 |
| `parallel-web` / `exa-search` | **5.3 单挂** | 付费/外部服务 |

---

## 七、落地建议（执行路线）

### 7.1 内置化（优先级 P0 → P2）

**P0（差异化护城河，立刻做）**：

1. 内置 `academic-research-skills/academic-pipeline` 10 阶段编排 → 模块 8 编排器
2. 内置 `academic-research-skills/academic-paper` 12-agent 写作流 → 模块 5 写作后端
3. 内置 `AI-Research-SKILLs/0-autoresearch-skill` 两环路 → 整个"研究项目"调度核心
4. 内置 `research-hub/research-hub` 的 `.research/` 协议 + Zotero-Obsidian 桥 → 模块 1+2 互操作
5. 内置 `nature-skills/nature-academic-search`（含现成 MCP Server）→ 模块 1 搜索后端

**P1（科研人员天天用）**：

6. 内置 `nature-skills/nature-ref-verifier`（引用真实性）→ 防 hallucination
7. 内置 `nature-skills/nature-paper2ppt`（Nature PPT）→ 模块 7 演示
8. 内置 `academic-research-skills/academic-paper-reviewer` → 模块 5 自审
9. 内置 `research-hub/literature-triage-matrix`、`gap-to-topic`、`paper-summarize`、`paper-memory-builder` → 模块 1+5
10. 内置 `scientific-agent-skills/scientific-visualization`、`scientific-slides`、`scientific-schematics`、`latex-posters`、`infographics` → 模块 7

**P2（增强专业度）**：

11. 内置 `Auto-Empirical-Research-Skills` 的 9 阶段模板 → 全模块教学约束
12. 内置 `nature-skills/nature-experiment-log` → 模块 4 日志模板
13. 内置 `scientific-agent-skills/statistical-analysis`、`statistical-power`、`experimental-design`、`hypothesis-generation`、`what-if-oracle` → 模块 4
14. 内置 `PaperSpine/paper-spine` 端到端入口 → 模块 5 启动页

### 7.2 Skill Market 分组（货架设计）

```
Skill Market
├── 精选 / Featured（精选预设包）
├── 论文写作套装（academic-paper + nature-polishing + nature-writing + paper-analyzer）
├── 论文阅读套装（paper-summarize + literature-triage-matrix + gap-to-topic + nature-reader）
├── 期刊风润色包（nature-polishing + nature-citation + nature-response + nature-reviewer + nature-figures）
├── 实证研究 A 到 Z（Auto-Empirical 全套）
├── AI/ML 训练工具栈（AI-Research-SKILLs 全部，60+ skill 一键安装）
├── 自走式研究（autoresearch + deep-research + academic-pipeline）
├── 学科工具包
│   ├── 单细胞组学
│   ├── 基因组/测序
│   ├── 化学分子
│   ├── 材料物理
│   ├── 临床医学
│   ├── 量子计算
│   └── 实验机器人
└── 通用文档工具（pdf / docx / pptx / xlsx / scientific-slides / latex-posters）
```

### 7.3 关键技术决议

1. **内置功能以 plugin/MCP server 形式接入**（不动 OpenCode 内核）。
2. **复用 SKILL.md frontmatter 规范**（Anthropic 官方），让 Market 自然标准化。
3. **保留 skill 之间的依赖关系**（如 `academic-paper-reviewer` 依赖 `academic-paper`），Market 装时自动装配。
4. **`research-hub` 的 `.research/` 目录协议** 应作为平台事实规范。
5. **`.paper/claims.yml` + `.paper/figures.yml` 协议**（PaperSpine + research-hub）应作为写作模块的事实规范。

---

## 八、总结

- **挑出 30~40 个 skill 转内置**（覆盖研究工作流的核心差异化能力），全部集中在 4.1-4.6 列出。
- **剩下 250+ 个 skill 全部进 Skill Market**，按"学科工具包 / AI 工具栈 / 通用工具"分组。
- **最具战略价值的 4 个内置候选**：`academic-pipeline`（编排器）、`academic-paper`（写作流水线）、`autoresearch`（自主研究）、`nature-academic-search`（中文学术搜索 MCP Server）——这 4 个直接决定 ResearchOS 作为"科研 OS"的差异化竞争力。
- **可立即收益**：模块 1（文献）+ 模块 5（写作）+ 模块 8（编排） 三块可直接复用开源 skill 改造，节省数月研发。
