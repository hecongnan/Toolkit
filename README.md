# Toolkit · 个人行动工作台

围绕一件事：把想做的事安排好，执行，再根据结果调整。

| 页面 | 解决的问题 | 下一步 |
| --- | --- | --- |
| 概览 `/` | 今天先做什么？本周安排了多少？ | 进入今日待办或周计划 |
| 每日待办 `/todos` | 今天如何执行、改期、处理逾期？ | 完成、恢复、编辑、排序或跳过 |
| 一周计划 `/week` | 事情放在哪一天更合适？ | 选日期、添加任务、勾选完成、进入每日编辑 |
| 行动回顾 `/review` | 最近计划完成得怎样？ | 按近 7 / 30 天查看、筛选，再回到计划调整 |

四个页面共用 Supabase 的 `todos` 和 `todo_series`，无需维护多份清单。学习资料、GitHub 分析和 AI 设置已退役，相关请求接口和运行依赖已移除。

## 启动

需要 Node.js 20+、npm 和 Supabase 项目。以下命令适用于 Bash：

```bash
npm ci
cp .env.local.example .env.local
# 填入 Supabase 项目 URL 和 anon public key
npm run dev
```

环境变量只需：

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

新数据库依次在 Supabase SQL Editor 执行：

1. `lib/supabase/schema.sql`
2. `lib/supabase/migrations/20261002_todo_recurrence.sql`

**已有 Todo 3.0 数据库不需要为本轮重构执行 SQL。** 不要通过重跑建表脚本升级旧库。旧学习资料、分析报告和对话表未被删除，新界面不再读取它们。数据过渡说明见 [工作区重构](docs/workspace-redesign.md)。

在 Supabase Auth 启用邮箱登录，并将站点域名与 `/auth/callback` 加入登录和重置密码允许的回调地址。本地地址为 `http://localhost:3000/auth/callback`。

## 实际行为

- 邮箱登录、注册、密码找回与重置；页面导航复用已验证的登录状态。
- 创建、编辑、完成、恢复、删除任务；支持优先级、计划时间、排序和单次改期。
- 每天、周一至周五、每周重复；重复规则按日历日期出现，与上次是否完成无关。
- 重复任务支持仅修改本次或这次及以后，支持跳过与停止；完成历史保留。
- 创建任务草稿按账号保留在当前标签页；编辑关闭前保护未保存内容。
- 一周计划展示周一至周日，支持跳转日期、前后切周、在指定日期添加任务。
- 周视图勾选立即反馈、保留列表位置；失败仅恢复对应任务，可再次操作重试。
- 回顾按计划日期和当前状态计算，包括今天；跳过项不计入完成比例。没有任务时显示“—”，不伪造完成率。
- 回顾支持近 7 / 30 天搜索与状态筛选，筛选不改变整个时间段的统计。
- 范围数据分批加载完整后才公布统计；失败不显示部分结果为全部，刷新失败保留上次内容并说明。
- 浅色、深色、小屏、大字号、键盘导航和减少动态效果。

计划时间只做记录，不发送提醒。回顾不代表实际完成时刻，改期、删除和恢复会改变统计。未实现目标分组、跨设备实时订阅、完成时间流水或离线写入。

## 技术与验证

Next.js 14 · React 18 · TypeScript · Tailwind CSS · Supabase Auth/Postgres。

```bash
npm run test:todos
npm run lint
# 如果 Playwright 没有安装浏览器，可指向现有 Chromium：
TOOLKIT_TEST_BROWSER=/opt/google/chrome/chrome npm run test:ui
npm run build
npm run start
```

数据库测试使用内存 PostgreSQL；界面测试自动启动本地生产预览并拦截 Supabase 请求，使用虚假账号和数据。不得把正式数据库地址或账号放进测试夹具。

浏览器测试覆盖用户流程和异常状态，不替代真机键盘、输入法与网络检查。前端遵循 apple-design 与 emil-design-eng，规则见 [前端设计](docs/frontend-design.md)。

## 架构

```text
app/
  page.tsx             今日入口
  todos/page.tsx       每日执行与编辑
  week/page.tsx        一周安排
  review/page.tsx      行动回顾
  login/ ...           登录、注册和密码恢复
  learning/ github/ settings/
                       旧地址重定向，不再提供旧功能
components/
  workspace/           共享日期范围加载、任务行和加载反馈
  todos/               每日任务、草稿、编辑和菜单
  auth/ shell/ ui/     登录、导航与基础组件
lib/
  task-workspace.ts    周边界、日期范围、统计与任务入口
  todo-data.ts         共用创建任务及结果确认
  todo-dates.ts        日期、重复规则和错误处理
  supabase/            客户端、行映射、RLS 和迁移
```

部署继续使用 EdgeOne Pages 和现有 `edgeone.json`，见 [部署说明](docs/edgeone-pages.md)。为兼容 EdgeOne，项目不使用 Next Middleware。推送与部署状态应分别确认。
