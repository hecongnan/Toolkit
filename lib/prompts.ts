import type { RepoBundle } from "@/lib/github";

/**
 * Stable system prompt — kept verbatim across requests so the prompt cache
 * (cache_control: ephemeral) can serve repeat calls cheaply. Do NOT
 * interpolate timestamps, repo names, or anything per-request here.
 */
export const ANALYZER_SYSTEM_PROMPT = `你是一位资深的开源软件架构师与技术导师，擅长用通俗易懂的中文向新接触者讲解项目结构。

你的任务是为用户提供的 GitHub 仓库生成一份**完整、清晰、可读性极强**的中文分析报告。

## 输出格式

严格使用以下 Markdown 结构（章节顺序固定，标题层级保留）：

\`\`\`
# 仓库分析：{owner}/{repo}

> 一句话总结（不超过 60 字）

## 📋 项目概述
- 项目目标与定位（解决什么问题、面向谁）
- 适用场景与典型用户
- 项目状态（活跃度、stars、近期更新）

## 🛠️ 技术栈
- **语言**：主要编程语言 + 占比/作用
- **框架与库**：主要依赖（从 package.json/pyproject.toml 等推断）+ 它们各自负责的部分
- **构建/工具链**：打包、测试、部署相关工具
- **运行环境**：Node 版本、Python 版本、Docker 等

## 📁 目录结构
用 Markdown 代码块绘制简化的目录树（仅展示关键目录，不超过 30 行），并在树之后用 \`-\` 列表逐项说明 **每个关键目录/文件的职责**。
注意：树中应忽略 node_modules、dist、build、.git 等无意义目录。

## ⚙️ 核心模块
挑选 3–6 个最关键的模块/文件，每个用三级标题展开：
- 它做什么
- 关键函数/类与它们的协作方式
- 在整个项目中扮演的角色

## 📖 阅读建议
- 推荐的阅读顺序（按文件路径列出，附上理由）
- 必备的前置知识（语言/框架/概念）
- 可以先跳过的部分（避免在细节中迷失）
- 建议动手实验的入口（运行 demo / 修改某个文件观察效果）

---

## 写作要求

1. **语气友好、专业**——像在和一位想入门这个项目的开发者面对面讲解
2. **避免空话**：每条结论都基于用户提供的代码/配置文件证据，必要时引用文件路径或代码片段（用反引号或代码块）
3. **不照搬 README**——README 是参考之一，你需要在它之上提供更深入的洞察
4. **当信息不足时**坦诚说明（"从提供的内容看不出 X，需要进一步查看 Y 文件"），不要编造
5. 全篇使用中文，技术术语保留英文原词（例如 React、Hook、middleware）`;

const TREE_RENDER_LIMIT = 400;

function summarizeTree(bundle: RepoBundle): string {
  const lines = bundle.tree
    .filter((e) => e.type === "blob" || e.type === "tree")
    .slice(0, TREE_RENDER_LIMIT)
    .map((e) => {
      if (e.type === "tree") return `${e.path}/`;
      const sizeKb = e.size ? ` (${(e.size / 1024).toFixed(1)} KB)` : "";
      return `${e.path}${sizeKb}`;
    });
  return lines.join("\n");
}

function fileBlock(path: string, content: string): string {
  return `### \`${path}\`\n\n\`\`\`\n${content}\n\`\`\``;
}

export function buildUserPrompt(bundle: RepoBundle): string {
  const meta = bundle.meta;
  const parts: string[] = [];

  parts.push(`# 待分析仓库：${meta.fullName}`);
  parts.push("");
  parts.push("## 仓库元信息");
  parts.push(`- **描述**: ${meta.description ?? "（无）"}`);
  parts.push(`- **主语言**: ${meta.language ?? "未知"}`);
  parts.push(`- **默认分支**: ${meta.defaultBranch}`);
  parts.push(`- **本次分析分支**: ${bundle.branch}`);
  parts.push(`- **Stars**: ${meta.stars} · **Forks**: ${meta.forks} · **Open Issues**: ${meta.openIssues}`);
  if (meta.topics.length) parts.push(`- **Topics**: ${meta.topics.join(", ")}`);
  if (meta.license) parts.push(`- **License**: ${meta.license}`);
  if (meta.homepage) parts.push(`- **Homepage**: ${meta.homepage}`);
  if (meta.pushedAt) parts.push(`- **最近推送**: ${meta.pushedAt}`);

  parts.push("");
  parts.push(
    `## 文件树（共 ${bundle.tree.length} 项${bundle.treeTruncated ? "，已被 GitHub API 截断" : ""}）`,
  );
  parts.push("```");
  parts.push(summarizeTree(bundle));
  parts.push("```");

  if (bundle.readme) {
    parts.push("");
    parts.push("## README");
    parts.push("```markdown");
    parts.push(bundle.readme);
    parts.push("```");
  }

  const configEntries = Object.entries(bundle.configFiles);
  if (configEntries.length) {
    parts.push("");
    parts.push("## 配置文件");
    for (const [path, content] of configEntries) {
      parts.push("");
      parts.push(fileBlock(path, content));
    }
  }

  const sourceEntries = Object.entries(bundle.sourceFiles);
  if (sourceEntries.length) {
    parts.push("");
    parts.push("## 关键源文件（启发式抽取）");
    for (const [path, content] of sourceEntries) {
      parts.push("");
      parts.push(fileBlock(path, content));
    }
  }

  parts.push("");
  parts.push(
    "请按照系统提示要求的格式生成一份完整的中文分析报告。直接输出 Markdown，无需额外解释。",
  );

  return parts.join("\n");
}
