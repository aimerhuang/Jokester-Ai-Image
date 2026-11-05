# Jo AI Image

Vue 3 + Vite + TypeScript 前端，用于 AI 生图、图库、积分和账号管理。

## 技术栈

- Vue 3、Vue Router、Pinia
- Vite、TypeScript
- Element Plus
- Axios

## 本地开发

1. 安装依赖：

```bash
npm install
```

2. 以 [.env.example](.env.example) 为模板准备本地 `.env`。`VITE_PROMPT_IMAGE_ROOT` 应指向后端同步任务使用的提示词封面根目录。

3. 启动开发服务器：

```bash
npm run dev
```

Vite 开发代理会把 `/api`、`/ai-images`、`/avatar` 和 `/nano-banana2-images` 转发到 `VITE_API_PROXY_TARGET`（默认 `http://localhost:5049`）。
提示词封面在本地开发时由 `VITE_PROMPT_IMAGE_ROOT` 只读提供；如果已有独立静态图片服务，可改用 `VITE_PROMPT_IMAGE_PROXY_TARGET`，代理配置优先于本地目录。

## 使用 pm2 常驻开发服务器

项目根目录下的 [ecosystem.config.cjs](ecosystem.config.cjs) 会通过 PM2 常驻运行绑定到 `0.0.0.0` 的 Vite 开发服务器：

```bash
pm2 start ecosystem.config.cjs
pm2 logs jokester-ai-image
```

停止进程：

```bash
pm2 stop jokester-ai-image
pm2 delete jokester-ai-image
```

这不是生产部署配置，Vite 端口也没有固定。

## Docker 镜像

生产和本地联调都使用本仓库的 `Dockerfile`：Node 阶段执行 `npm ci && npm run build`，运行阶段由 nginx
托管 `dist/`，负责 SPA history fallback，并把 `/api`、`/avatar`、`/blog`、`/prompt-images`、`/swagger`
反向代理到 `api:8080`。nginx 配置在 `docker/nginx/`，运行期通过环境变量切换：

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `API_UPSTREAM` | `api:8080` | 后端地址 |
| `APP_DOMAIN` | `localhost` | 主域名；`www.` 前缀会 301 到主域名 |
| `TLS_MODE` | `off` | `on` 时监听 443，证书挂载到 `/etc/nginx/certs/tls.crt`、`tls.key` |
| `REAL_IP_MODE` | `none` | `cloudflare` 时只信任 Cloudflare 网段传来的 `CF-Connecting-IP` |

`VITE_*` 只在构建期生效，通过 `--build-arg` 传入。整套编排（前端 + 后端 + MySQL + Redis）在后端仓库
`Jokester.Admin/docker/`，本地运行见该目录的 `README.md`；TeamCity 发布使用 `deploy/teamcity-build.ps1`
构建镜像、`deploy/teamcity-deploy.ps1` 上传并调用服务器上的 `jokester.sh deploy-web`。

## 常用命令

```bash
npm run dev      # 启动开发服务器
npm run build    # 类型检查并构建生产包
npm run preview  # 预览生产构建
npm run test:e2e:ai-size # 运行尺寸模式定向 E2E
```

首次运行浏览器测试前安装 Chromium：

```bash
npx playwright install chromium
```

`npm run test:e2e` 运行全部浏览器用例；日常改动应优先执行与受影响流程对应的定向脚本。

生图工作台以模型 catalog 为权威：GPT explicit 分辨率固定展示为 `1K、2K、4K`，同时支持两种尺寸模式时显示“自定义尺寸/自动尺寸”；auto 下隐藏分辨率和画幅比例。前端不会仅凭全局参数目录补出模型未声明的能力。

## 主要路由

- `/login`：登录
- `/register`：邮箱验证码注册
- `/playground`：AI 生图工作台
- `/images`：我的画廊
- `/prompts`：提示词库、搜索、复制和用于创作
- `/images/:id/edit`：图片详情、复用参数、收藏、下载
- `/credits`：积分明细
- `/pricing`：生图模型、分辨率和画质的积分定价
- `/recharge`：积分充值、创建订单和兑换充值卡密
- `/admin/redeem-codes`：超级管理员按动态套餐或自定义积分批量签发兑换码
- `/profile`：头像、昵称、密码和登出

## 法律文档

- `/legal/privacy/index.html`：隐私政策静态页面
- `/legal/terms/index.html`：服务条款静态页面
- `/legal/ai-processing/index.html`：AI 数据处理告知静态页面

源文件位于 `public/legal/`，`npm run build` 后会原样进入 `dist/legal/`。法律页面和 `GET /api/legal/documents/current?platform=web&locale=zh-CN` 与注册参数、注册校验解耦；注册只提交邮箱、邮箱验证码和密码。部署时仍须先发布静态页面，再按后端 runbook 配置同一版本的绝对 HTTPS URL。

第三方 AI 数据处理告知已加入当前未提交工作区并进入本地生产构建，但公网静态页面及后端文档版本配置仍需在部署时验证。该告知不参与注册；用户首次生图缺少当前 Provider 授权时，后端返回 `AI_CONSENT_REQUIRED`，前端展示告知并在用户确认后记录授权、自动重试原任务。告知缺失时仍由服务端 fail-closed，前端不得绕过。

## 文档

- [API 集成指南](integration-guide.md)
- [前端开发任务书](前端开发任务书.md)
- [视觉设计方案](视觉设计方案.md)
- [积分套餐与跨端改造 PRD](point-package-frontend-prd.md)（跨端评审输入；本仓库只实现 Web）
