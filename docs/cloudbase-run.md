# CloudBase Run 部署

本项目使用 Next.js standalone 容器运行，监听 `0.0.0.0:3000`。

## 1. 创建服务

1. 登录腾讯云 CloudBase 控制台并创建环境。
2. 进入 CloudBase Run，创建新服务。
3. 选择 GitHub 仓库 `hecongnan/Toolkit`，生产分支选择 `main`。
4. 构建方式选择仓库内的 `Dockerfile`，服务端口填写 `3000`。

## 2. 运行时环境变量

在服务的环境变量中配置：

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
ANTHROPIC_BASE_URL=https://api.deepseek.com
ANTHROPIC_AUTH_TOKEN=
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_CHAT_MODEL=deepseek-chat
GITHUB_TOKEN=
```

`ANTHROPIC_AUTH_TOKEN` 可以留空，让用户在应用的“AI 设置”中使用自己的 Key。`GITHUB_TOKEN` 可选，用于提高 GitHub API 请求限额。

`NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 会由服务端在请求时注入页面，不需要配置 Docker 构建参数。Supabase anon key 是公开客户端凭据，数据权限由 RLS 控制。

## 3. 健康检查

配置以下健康检查：

```text
Path: /api/health
Port: 3000
Initial delay: 15s
Timeout: 5s
```

部署成功后访问 `https://<CloudBase 域名>/api/health`，应返回 `status: ok`。

## 4. Supabase 登录回调

复制 CloudBase 分配的 HTTPS 域名，然后进入 Supabase：

```text
Authentication -> URL Configuration
```

将 CloudBase 域名设置为 `Site URL`，并加入 `Redirect URLs`。完成后重新部署服务。

## 5. 自动部署

启用 GitHub 自动构建后，每次推送到 `main` 都会触发 CloudBase Run 重新构建和发布。
