# Toolkit · 个人行动工作台

围绕一件事：把想做的事安排好，执行，再根据结果调整。

| 页面 | 解决的问题 | 下一步 |
| --- | --- | --- |
| 概览 `/` | 今天先做什么？本周安排了多少？ | 进入今日待办或周计划 |
| 每日待办 `/todos` | 今天如何执行、改期、处理逾期？ | 完成、恢复、编辑、排序或跳过 |
| 一周计划 `/week` | 事情放在哪一天更合适？ | 选日期、添加任务、勾选完成、进入每日编辑 |
| 时间记录 `/time` | 时间实际花在哪里？ | 独立或关联任务计时，暂停、结束保存或补记 |
| 笔记 `/notes` | 做完后有什么收获、问题或知识？ | 独立记录或关联某次任务，搜索，再返回任务 |
| 行动回顾 `/review` | 最近计划完成得怎样？时间如何分配？ | 按近 7 / 30 天查看任务与用时饼图，再调整安排 |

任务页面共用 Supabase 的 `todos` 和 `todo_series`，无需维护多份清单。时间记录保存在 `time_records`，笔记保存在 `task_notes`，都可以关联任务，但不会改变任务完成状态。学习资料、GitHub 分析和 AI 设置已退役，相关请求接口和运行依赖已移除。

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
3. `lib/supabase/migrations/20261015_time_tracking.sql`
4. `lib/supabase/migrations/20261016_task_notes.sql`

**已启用时间记录的数据库，本轮只需执行第 4 份笔记迁移。** 仅有 Todo 3.0 的旧库则补齐第 3、4 份。请在 Supabase SQL Editor 执行对应完整文件后再发布前端，不要重跑基线建表脚本来升级旧库。迁移不清除任务或旧模块数据，支持重复执行；缺少迁移时对应功能显示更新提示，任务仍可使用。详见 [时间记录](docs/time-tracking.md) 和 [任务笔记](docs/task-notes.md)。

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
- 时间记录支持开始、暂停、继续、结束保存；切页和刷新不会丢失服务端计时。每个账号只能有一条未结束计时。
- 可独立记录活动，也可从任务的“记录时间”入口开始。支持补记过去的时段、编辑和删除，补记时段不能与已有记录或当前计时重叠。
- 回顾饼图按工作、学习、生活、其他显示实际用时及百分比。暂停不计时，未结束计时不入图，跨天按当前范围裁剪。
- 概览显示今日已保存用时及分类摘要，当前计时单独展示，支持直接暂停或继续。
- 每日待办显示本次任务所有已保存记录的累计用时，不限近 30 天；可一键继续记录，沿用最近一次分类。重复任务的不同日期分别累计，不会自动切换或结束另一条计时。
- 完成任务后可选“记录笔记”，不强制打开弹窗；也可随时从任务的“写笔记”或“任务笔记”进入。重复任务按具体任务 ID 区分，任务删除后笔记仍保留。
- 笔记支持纯文本、换行和代码缩进，标题可留空；可搜索标题、正文和记录时任务名，按任务筛选，分页查看、编辑和删除。
- 笔记草稿按账号保留在当前标签页，恢复前确认，不自动转移到另一个任务；关闭前保护内容，保存失败保留输入，版本冲突可另存副本。
- 范围数据分批加载完整后才公布统计；失败不显示部分结果为全部，刷新失败保留上次内容并说明。
- 浅色、深色、小屏、大字号、键盘导航和减少动态效果。

计划时间只做记录，不发送提醒。回顾不代表实际完成时刻，改期、删除和恢复会改变统计。未实现目标分组、跨设备实时订阅、完成时间流水或离线写入。

## 技术与验证

Next.js 14 · React 18 · TypeScript · Tailwind CSS · Supabase Auth/Postgres。

```bash
npm run test:todos
npm run test:time
npm run test:notes
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
  time/page.tsx        计时、补记和时间明细
  notes/page.tsx       任务笔记、搜索和记录管理
  review/page.tsx      行动回顾
  login/ ...           登录、注册和密码恢复
  learning/ github/ settings/
                       旧地址重定向，不再提供旧功能
components/
  workspace/           共享日期范围加载、任务行和加载反馈
  todos/               每日任务、草稿、编辑和菜单
  time/                全局计时状态、记录表单、饼图与明细
  notes/               笔记编辑、草稿、列表与任务定位
  auth/ shell/ ui/     登录、导航与基础组件
lib/
  task-workspace.ts    周边界、日期范围、统计与任务入口
  todo-data.ts         共用创建任务及结果确认
  todo-dates.ts        日期、重复规则和错误处理
  time-tracking.ts     真实时段裁剪、分类统计和时间格式
  time-data.ts         按日期或任务批量分页读取已保存记录
  notes.ts             笔记类型、搜索标准化与草稿校验
  supabase/            客户端、行映射、RLS 和迁移
```

部署继续使用 EdgeOne Pages 和现有 `edgeone.json`，见 [部署说明](docs/edgeone-pages.md)。为兼容 EdgeOne，项目不使用 Next Middleware。推送与部署状态应分别确认。
