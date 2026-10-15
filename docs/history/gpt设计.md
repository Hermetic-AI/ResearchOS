明白，你这个定位需要重新拔高。

你不是要做一个「科研 Skill 集合」，而是要做：

> **基于 OpenCode Agent Framework 二次开发的下一代 AI 科研工作站（AI Research Workstation / Research OS），将现有科研工具链（Zotero、Obsidian、Jupyter、LaTeX、GitHub、数据分析环境）融合，通过 Agent + Skill + Workspace 形成完整科研生产力平台。**

赛题中的 Skill 只是其中一个技术落地点，而不是产品本身。

下面按照黑客松项目方案书形式重新设计。

---

# 项目名称

# ResearchOS

## 下一代 AI 原生科研工作站

### —— 基于 Agent OS 的科研全生命周期智能协作平台

---

# 一、项目背景

## 1. 当前科研工作流痛点

现代科研已经高度数字化，但工具链长期割裂：

```
文献搜索
   |
Zotero

论文阅读
   |
PDF Reader

知识整理
   |
Obsidian

实验开发
   |
Jupyter Notebook

代码管理
   |
GitHub

数据分析
   |
Python/R

论文写作
   |
Latex

论文发布
   |
期刊系统
```

科研人员需要在多个工具之间切换：

* 文献需要人工整理
* 知识需要人工关联
* 实验需要重复编写代码
* 数据需要手动分析
* 论文需要重复排版
* 代码复现困难

大量科研时间消耗在：

> 信息整理、工具操作、重复劳动，而非真正创新。

---

# 二、项目目标

打造一个：

## AI Native Research Workspace

即：

> 一个以 Agent 为核心，将科研人员从“工具使用者”转变为“科研任务指挥者”的智能科研操作系统。

目标：

```
科研人员
    |
    |
ResearchOS
    |
    |
AI Research Agent
    |
------------------------------------------------
|        |          |          |                |
文献     知识       实验       数据             写作
Agent    Agent      Agent      Agent           Agent

```

---

# 三、整体技术架构

基于 OpenCode 开源项目进行二次开发。

## 为什么选择 OpenCode？

OpenCode 已具备：

* CLI Agent Runtime
* Web Interface
* Desktop Application
* Coding Agent
* Tool Calling
* MCP扩展能力
* GitHub代码理解能力
* Repo级上下文管理能力

因此：

不重复建设 Agent 基础设施。

重点建设：

> 科研领域 Workspace + Research Agent Ecosystem

---

# 四、系统整体架构

```
                    ResearchOS


                       用户


                        |
                        |

              Research Desktop App


                        |

              OpenCode Agent Core


                        |

        --------------------------------

              Research Agent Layer


 文献Agent    实验Agent    数据Agent    写作Agent

     |            |            |           |

     |            |            |           |

  Zotero       Python       Analysis     Latex
  Engine       Runtime      Engine       Engine


        ---------------------------------

                 Research Skill Layer


 Literature Skill

 Knowledge Skill

 Experiment Skill

 Data Science Skill

 Paper Writing Skill

 Coding Skill


        ---------------------------------

              Research Knowledge Base


 Vector DB

 Knowledge Graph

 Local File System

 Git Repository


```

---

# 五、核心功能模块设计

---

# 模块一：AI 文献研究中心

## 类似 Zotero + AI Research Agent

目标：

替代传统文献管理工具。

## 功能

### 1. 文献智能搜索

支持：

* arXiv
* Google Scholar
* PubMed
* IEEE
* Semantic Scholar

用户：

```
寻找关于Multi-Agent系统近三年的研究
```

系统：

自动：

* 搜索论文
* 下载PDF
* 提取元信息
* 分类

生成：

```
Paper Card

Title:
AgentBench

Author:

Year:

Dataset:

Method:

Contribution:

Citation:

Related Work:

```

---

## 2. 文献元数据管理

自动提取：

* Title
* Author
* Conference
* DOI
* Citation
* Keywords

支持：

格式转换：

```
BibTex

EndNote

RIS

Markdown

JSON
```

---

## 3. AI论文阅读

PDF进入：

```
ResearchOS

      |

Paper Understanding Agent

```

能力：

* 摘要总结
* 方法分析
* 实验分析
* 创新点提取
* 局限性分析

支持：

多论文对比：

```
Compare 20 papers

↓

Research Gap Discovery

```

---

# 模块二：科研知识管理中心

## 类似 Obsidian + AI Knowledge Graph

传统：

```
论文
 |
人工创建笔记
 |
人工链接
```

ResearchOS：

```
论文

↓

AI理解

↓

自动生成知识节点

↓

知识图谱

```

---

## 知识图谱

例如：

```
                 Transformer

                     |

        --------------------------

        |                        |

      GPT                    BERT


        |

     Agent


        |

   Tool Calling


```

自动展示：

* 技术演进路线
* 研究热点
* 作者关系
* 引用关系

---

# 模块三：AI 实验设计中心

目标：

辅助科研人员设计实验。

## 实验规划 Agent

输入：

```
研究假设：

Memory机制是否提升Agent能力？
```

生成：

```
Experiment Plan


Hypothesis:

Memory improves success rate


Baseline:

GPT-4

Agent without memory


Dataset:

GAIA


Metrics:

Accuracy

Latency

Cost


Ablation:

Remove memory

```

---

## 参数优化

集成：

* Optuna
* Ray Tune

自动探索：

```
learning rate

batch size

model parameters

prompt parameters

```

---

# 模块四：AI 数据分析中心

## 类似 Jupyter + Copilot

集成Python科研生态：

```
numpy

pandas

scipy

sklearn

matplotlib

plotly

pytorch

```

---

用户上传：

```
experiment.csv

```

Agent：

自动：

```
数据检测

↓

异常分析

↓

统计检验

↓

可视化

↓

实验报告

```

生成：

论文级：

```
Figure

Table

Analysis

```

---

# 模块五：AI 论文写作中心

## 类似 Overleaf + AI Copilot

集成：

Latex编辑器。

功能：

## 论文结构生成

输入：

```
研究方向
```

输出：

```
paper.tex


Introduction

Related Work

Method

Experiment

Conclusion

```

---

## AI Writing Assistant

支持：

### Abstract生成

### Introduction扩写

### Related Work生成

### Academic Rewrite

---

## 引用助手

自动：

* Citation推荐
* BibTex生成
* 格式检查

支持：

```
Nature

IEEE

ACM

Springer

```

---

# 模块六：AI Coding & Reproduction Center

这是 OpenCode 最大优势。

## 论文代码复现

输入：

```
论文地址

GitHub Repo

```

Agent：

自动：

```
Clone Repo

↓

代码分析

↓

环境检测

↓

Docker生成

↓

运行实验

↓

结果比较

```

---

## Repository Intelligence

继承 OpenCode能力：

支持：

* GitHub连接
* Repo理解
* Code Search
* 自动修改代码
* 自动实验

例如：

```
为什么论文结果无法复现？
```

Agent：

分析：

```
代码版本差异

依赖问题

参数问题

数据问题

```

---

# 六、Research Agent体系

不是简单Skill。

采用多Agent协作。

```
              Research Manager Agent


                      |

 ------------------------------------------------

 |             |              |                |

Literature   Knowledge    Experiment      Writing

Agent        Agent        Agent            Agent


 |

Coding Agent(OpenCode)

```

---

# 七、Skill生态设计

Skill作为底层能力插件。

类似：

VSCode Extension

例如：

```
research-skills

├── paper-reader

├── citation-manager

├── knowledge-builder

├── experiment-designer

├── data-analyzer

├── latex-writer

├── github-reproducer

```

未来：

形成：

```
Research Skill Marketplace

```

---

# 八、黑客松版本 MVP

一周无法完成完整平台。

建议实现核心闭环。

## Demo流程：

用户：

```
我要研究：
大模型Agent自动规划能力
```

系统：

---

### Step 1 文献中心

自动：

搜索20篇论文

↓

生成：

论文知识库

---

### Step 2 知识图谱

生成：

Agent领域发展路线

---

### Step 3 实验设计

生成：

实验方案

---

### Step 4 数据分析

上传实验结果

↓

自动生成：

Figure

---

### Step 5 论文生成

生成：

Latex论文初稿

---

# 九、项目创新点

## 创新点1

### 从AI助手升级为AI科研工作站

不是：

```
ChatGPT问答

```

而是：

```
Research Workspace
+
Agent
+
Knowledge
+
Tools

```

---

## 创新点2

### 基于OpenCode打造科研Agent OS

复用成熟Coding Agent能力。

让：

代码智能

进入科研流程。

---

## 创新点3

### 科研能力模块化生态

科研方法：

↓

Skill

↓

Agent

↓

Marketplace

形成持续扩展能力。

---

# 十、最终项目介绍（一句话）

> ResearchOS 是一个基于 OpenCode Agent Framework 构建的 AI 原生科研工作站，通过融合文献管理、知识图谱、实验设计、数据分析、论文写作和代码复现能力，将科研全生命周期工具链统一到 Agent 驱动的平台中，实现科研流程智能化、自动化和可复用化。

---

这个方案比之前的 Skill 集合定位高一个层级，更符合黑客松评审视角：

**OpenCode 是底座 → Skill 是生态 → ResearchOS 是产品。**

而且一周内可以用 Demo 证明核心闭环。你后续答辩重点应该放在「AI科研操作系统」这个概念，而不是「Skill开发」。
