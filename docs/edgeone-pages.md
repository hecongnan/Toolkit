# EdgeOne Pages 部署

本项目通过 EdgeOne 的 OpenNext 适配器部署，保留 Next.js SSR、Middleware 和 API Route。不要将项目改为纯静态导出，也不要把输出目录设置为 `out`。

## 1. 导入仓库

1. 进入 EdgeOne Pages 控制台，选择“创建项目”或“导入 Git 仓库”。
2. 关联 GitHub，并选择 `hecongnan/Toolkit`。
3. 生产分支选择 `main`，根目录保持 `./`。
4. 框架选择 Next.js；仓库内的 `edgeone.json` 会提供其余构建配置。

构建配置应为：

```text
安装命令: npm ci
构建命令: npm run build
输出目录: .next
Node.js: 20.18.0
```

EdgeOne 会自动启用 `@edgeone/opennextjs-pages`，将动态页面、Middleware 和 `/api/*` 路由转换为平台函数。项目中的 `Dockerfile` 仅供容器平台使用，EdgeOne 不需要 Dockerfile、服务端口或健康检查配置。

## 2. 环境变量

在“项目设置 -> 环境变量”中添加：

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

可选变量：

```text
GITHUB_TOKEN
```

用户在应用的“AI 设置”中填写自己的 DeepSeek API Key，因此 EdgeOne 不需要配置 AI Key。`GITHUB_TOKEN` 只用于提高服务端访问 GitHub API 的限额。

环境变量修改后必须重新部署，新值不会应用到历史部署。

## 3. 部署与验证

点击“开始部署”，等待安装、Next.js 构建和函数打包全部完成。部署后依次验证：

```text
https://<EdgeOne 域名>/api/health
https://<EdgeOne 域名>/login
```

健康接口应返回 `status: ok`；未登录访问 `/todos` 应跳转到 `/login`。

## 4. Supabase 登录回调

复制 EdgeOne 分配的 HTTPS 域名，进入 Supabase：

```text
Authentication -> URL Configuration
```

将 EdgeOne 正式域名填写为 `Site URL`，并把以下地址加入 `Redirect URLs`：

```text
https://<EdgeOne 域名>/**
```

若以后绑定自定义域名，也要将自定义域名加入允许列表。

## 5. 自动部署

开启 Git 集成后，每次推送到 `main` 都会创建新的生产部署。预览分支可以使用 EdgeOne 的预览部署，不要将预览域名设置为 Supabase 的唯一 `Site URL`。
