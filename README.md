# Toolkit · 个人效能空间

一个面向移动端、平板、桌面的实用工具集合。整体风格高端简洁，包含三大模块：

- **学习资料整理**：分类、标签、状态、优先级、搜索筛选
- **每日 Todo**：按日期管理，进度追踪
- **GitHub 仓库分析**：粘贴仓库地址，由 DeepSeek 自动生成“项目概述 / 技术栈 / 目录结构 / 核心模块 / 阅读建议”完整中文报告，并支持围绕报告继续 AI 追问

技术栈：Next.js 14 (App Router) · React 18 · TypeScript · Tailwind CSS · Supabase Auth/Postgres · lucide-react · react-markdown。

---

## 数据存储在哪里？

当前版本使用 Supabase：

- 登录注册：Supabase Auth（邮箱密码）
- 学习资料：Supabase Postgres `materials` 表
- Todo：Supabase Postgres `todos` 表
- GitHub 分析历史：Supabase Postgres `analysis_reports` 表
- GitHub 报告追问：Supabase Postgres `analysis_chats` 表
- 数据隔离：四张表都带 `user_id`，并通过 Supabase RLS 限制 `auth.uid() = user_id`

旧版本曾使用浏览器 `localStorage`：`toolkit:materials`、`toolkit:todos`、`toolkit:reports`。新版登录后会在 Dashboard 提示是否把本机旧数据导入当前账号。

---

## 本地启动

```bash
# 1. 安装依赖
cd toolkit
npm install

# 2. 配置环境变量
cp .env.local.example .env.local
# 填入 Supabase URL / anon key，以及 DeepSeek token

# 3. 在 Supabase SQL Editor 执行建表脚本
# lib/supabase/schema.sql

# 4. 启动开发服务器
npm run dev
# 浏览器打开 http://localhost:3000
```

手机访问本机开发服务：

```bash
npm run dev:mobile
# 手机和电脑在同一 Wi-Fi 下，访问 http://<电脑局域网IP>:3000
```

构建生产版本：

```bash
npm run build
npm run start
```

---

## 环境变量

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase 项目 URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anon public key，配合 RLS 使用 |
| `ANTHROPIC_BASE_URL` | ❌ | DeepSeek 兼容入口，默认 `https://api.deepseek.com` |
| `ANTHROPIC_AUTH_TOKEN` | ❌ | 服务端默认 DeepSeek API token；用户也可在应用内配置自己的 Key |
| `DEEPSEEK_MODEL` | ❌ | 报告生成模型，默认 `deepseek-chat` |
| `DEEPSEEK_CHAT_MODEL` | ❌ | 报告追问模型，建议 `deepseek-v4-pro` |
| `GITHUB_TOKEN` | ❌ | 可选；GitHub Personal Access Token，用于提升 API 限额 |

> 服务端 DeepSeek token 和 GitHub token 不会暴露到客户端 bundle。用户在“AI 设置”中填写的 Key 只保存在当前浏览器，并仅随分析请求发送到本站服务端，不会写入 Supabase。

---

## Supabase 配置

1. 创建 Supabase 项目。
2. 打开 SQL Editor，执行 `lib/supabase/schema.sql`。
3. Authentication → Providers 中启用 Email。
4. 如果开启邮箱确认，在 Authentication → URL Configuration 配置：
   - Site URL：本地 `http://localhost:3000`，生产填 EdgeOne 正式域名
   - Redirect URLs：加入本地地址和 EdgeOne 正式域名
5. 把项目 URL 和 anon key 填入 `.env.local` / EdgeOne Environment Variables。

已有数据库升级到 Todo 2.0 时，在 SQL Editor 执行 `lib/supabase/migrations/20260913_todo_v2.sql`。迁移是幂等的，不会删除现有数据。

---

## EdgeOne Pages 部署

1. 将项目推送到 GitHub。
2. 在 EdgeOne Pages 导入该 GitHub 仓库，生产分支选择 `main`。
3. 使用仓库内的 `edgeone.json`：安装命令 `npm ci`，构建命令 `npm run build`，输出目录 `.next`，Node.js `20.18.0`。
4. 在 EdgeOne 配置环境变量：
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `GITHUB_TOKEN`（可选）
5. 部署完成后，将 EdgeOne 正式域名加入 Supabase 的 `Site URL` 和 `Redirect URLs`。

EdgeOne 会自动使用 OpenNext 适配器保留 SSR、Middleware 和 API Route，不要改成 `output: "export"`。完整步骤见 [`docs/edgeone-pages.md`](docs/edgeone-pages.md)。

---

## 功能介绍

### 登录注册（`/login`、`/register`）
- 邮箱密码注册/登录
- 未登录访问主应用会自动跳转登录页
- 侧边栏显示当前账号并支持退出登录

### Dashboard（`/`）
- 当日 todo 完成度、学习资料总数、最近分析三张统计卡
- 当日待办预览、最近分析快捷入口
- 检测旧 localStorage 数据并支持导入云端

### 学习资料（`/learning`）
- 增删改查、按分类/状态/关键字筛选
- 状态点击循环：待学 → 进行中 → 已完成
- 字段：标题、链接、分类、标签、状态、优先级、备注

### Todo（`/todos`）
- 按日期管理（昨天 / 今天 / 明天 + 任意日期）
- 优先级 P1–P3
- 支持编辑、计划时间和重复规则（每天 / 工作日 / 每周）
- 桌面端拖拽排序，移动端使用上下移动按钮
- 完成重复任务时自动创建下一期，并避免重复生成
- 当日完成进度条
- 完成项自动折叠到列表底部

### GitHub 分析（`/github`）

输入 `https://github.com/owner/repo`（或 `owner/repo` 简写）→ 后端流程：

1. 校验当前登录用户
2. 解析仓库 owner/repo/branch
3. 调用 GitHub REST API 获取仓库元信息、文件树、README、关键配置文件、入口源文件
4. 调用 DeepSeek Chat Completions 流式生成分析报告
5. 通过 SSE 推送给浏览器，前端流式渲染 Markdown 报告
6. 完成后保存到当前用户的 `analysis_reports` 表，可在历史中回看 / 下载 / 复制
7. 打开已保存报告后，可在“AI 追问”区域继续提问；问答历史保存到当前用户的 `analysis_chats` 表

输出报告固定章节：项目概述、技术栈、目录结构、核心模块、阅读建议。
追问回答会基于当前报告、仓库元信息和最近对话生成；如果报告信息不足，AI 会提示需要进一步查看哪些文件。

### AI 设置（`/settings`）

- 用户可以配置自己的 DeepSeek API Key
- 可分别设置仓库分析模型和报告追问模型
- 配置仅保存在当前浏览器；留空时回退到服务端环境变量

---

## 目录速览

```
app/
  layout.tsx           # 根布局 + AppShell
  page.tsx             # Dashboard
  login/page.tsx       # 登录
  register/page.tsx    # 注册
  learning/page.tsx    # 学习资料
  todos/page.tsx       # 每日 todo
  github/page.tsx      # GitHub 分析
  settings/page.tsx    # 用户 AI 配置
  api/analyze/route.ts # 后端 SSE 流式 API
components/
  auth/                # 登录注册表单
  shell/               # Sidebar / AppShell / PageHeader
  ui/                  # Button / Input / Card / Modal / Tag ...
  learning/            # 学习资料相关组件
  todos/               # Todo 相关组件
  github/              # GitHub 模块组件
lib/
  github.ts            # GitHub REST API 拉取
  prompts.ts           # 分析提示词
  storage.ts           # 旧 localStorage 迁移辅助
  supabase/            # Supabase client/server/schema/mappers
  types.ts             # 共享类型
  cn.ts                # className 工具
middleware.ts          # 登录态保护
```

---

## 常见问题

**Q: GitHub 分析提示 403 / 速率限制？**
A: 匿名 GitHub API 每小时只有 60 次请求。在 `.env.local` 添加 `GITHUB_TOKEN` 可提升限额。

**Q: GitHub 分析提示 401 / Invalid API key？**
A: 在应用的“AI 设置”中填写有效的 DeepSeek API Key；该 Key 只保存在当前浏览器。

**Q: 页面提示 Supabase 环境变量缺失？**
A: 检查 `.env.local` 是否包含 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY`，修改后需要重启 dev server。

**Q: 报告内容不准确？**
A: 受单文件 80KB / 总源码 200KB / 文件树 600 项的上限保护，超大仓库只能读取关键文件。可在 `lib/github.ts` 中调整这些常量。
