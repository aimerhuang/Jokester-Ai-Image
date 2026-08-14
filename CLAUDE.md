# CLAUDE.md

## 项目概况

Jokester AI Image 是一个 Vue 3 + Vite + TypeScript 前端项目，用于 AI 生图、图库、积分和账号管理。

## 开发命令

```bash
npm install
npm run dev
npm run build
npm run preview
```

`npm run build` 会先执行 `vue-tsc -b`，再执行 `vite build`。

## 环境变量

以 [.env.example](.env.example) 为配置键模板；本地 `.env` 已被 Git 忽略：

```env
VITE_API_BASE_URL=/api
VITE_API_DOC_URL=http://localhost:5049/swagger
VITE_API_PROXY_TARGET=http://localhost:5049
VITE_PROMPT_IMAGE_ROOT=D:/JokesterData/prompt-images
VITE_PROMPT_IMAGE_PROXY_TARGET=
VITE_DEFAULT_LOCALE=zh-CN
VITE_DEFAULT_THEME=light
```

开发代理在 [vite.config.ts](vite.config.ts) 中配置：`/api`、`/ai-images`、`/avatar` 和 `/nano-banana2-images` 默认转发到 `VITE_API_PROXY_TARGET`。`/api/avatar` 会重写为后端 `/avatar`。提示词封面优先代理到 `VITE_PROMPT_IMAGE_PROXY_TARGET`；未配置代理时，由开发服务器从 `VITE_PROMPT_IMAGE_ROOT` 只读提供 `/prompt-images/`。

## 源码结构

- [src/router/index.ts](src/router/index.ts)：路由与登录守卫
- [src/services/](src/services/)：Axios 封装和业务 API
- [src/stores/](src/stores/)：Pinia 状态，包括登录态、语言主题、积分、生图参数
- [src/views/](src/views/)：页面组件
- [src/components/](src/components/)：通用组件和图片组件
- [src/locales/](src/locales/)：中英文静态文案
- [src/styles/](src/styles/)：设计 token 和全局样式

## 主要路由

除独立全屏的 `/recharge` 外，受保护路由由 [src/layouts/AppLayout.vue](src/layouts/AppLayout.vue) 包裹；未登录会跳转 `/login`。`/admin/redeem-codes` 还要求当前用户 `isSuperAdmin=true`。

- `/login`
- `/register`
- `/playground`
- `/images`
- `/prompts`
- `/images/:id/edit`
- `/credits`
- `/pricing`
- `/recharge`
- `/admin/redeem-codes`（仅超级管理员）
- `/profile`

## API 约定

- Axios 实例在 [src/services/http.ts](src/services/http.ts)，`baseURL` 默认为 `VITE_API_BASE_URL || '/api'`。
- 登录 token 保存在 `localStorage.accessToken`；如果返回 refresh token，保存在 `localStorage.refreshToken`。
- 请求拦截器自动附加 `Authorization: Bearer <accessToken>`。
- HTTP 401 会先用 `localStorage.refreshToken` 调用 `POST /auth/refresh`，同一时间只发起一次刷新并重试原请求；无 refresh token 或刷新失败时才清 token、派发 `auth:expired` 并跳转登录页。
- 后端统一响应按 `{ code, message, data }` 解包；非 2xx code 会作为 `ApiError` 抛出。

## 生图实现要点

- 参数与模型：`GET /api/ai/images/parameters` + `GET /api/ai/images/models`，实现位于 [src/stores/imageOptions.ts](src/stores/imageOptions.ts)。
- 参考图上传：`POST /api/ai/images/upload`，控件位于 [src/components/images/ReferenceUploader.vue](src/components/images/ReferenceUploader.vue)，支持点击、拖拽、粘贴；限制 WEBP/JPG/PNG、最多 6 张、单张最大 10MB。新上传图片保留响应中的 `assetId`，创建任务优先提交 `referenceAssetIds`；只有历史/复用图片继续走 `referenceImageUrls` 兼容字段。
- 默认生成：`POST /api/ai/images`。
- Nano Banana：当 `modelCode` 归一化后等于 `nanobanana`、`nanobanana2` 或 `nanobananapro`，前端调用 `POST /api/ai/images/nanoBananaImage`，提交 `resolutionCode`、`aspectRatioCode`、`imageCount`、`imageAssetIds` 和兼容 `imageUrls`，不提交 GPT 的 `qualityCode`。
- 生成后如果返回 `id` 或 `taskId` 且未成功，前端每 3 秒轮询 `GET /api/ai/images/{id}`；待轮询 ID 保存在 `localStorage.pendingAiImageTaskId`。
- 图片预览兼容 `url`、`dataUrl`、`resultUrls`、`assets[].url`、`base64` 等响应字段。`/api/media/ai/` 和 `/api/assets/` 私有图片由 `useAuthenticatedImageUrls` 携带 token 拉取为 blob URL，避免裸 `<img>` 请求丢失鉴权头。

## 用户、积分与资料

- 登录、注册、邮箱验证码、profile、logout 位于 [src/services/auth.ts](src/services/auth.ts)。
- 昵称、密码、头像接口位于 [src/services/user.ts](src/services/user.ts)，统一使用 `/users/{userId}/...` 路径。
- 积分接口位于 [src/services/credits.ts](src/services/credits.ts)：余额以 `GET /points/balance` 为准，`GET /users/{userId}/point-details` 拉取流水，充值页使用 `/points/recharge/*` 套餐、下单和兑换接口。
- 提示词库位于 [src/services/prompts.ts](src/services/prompts.ts) 和 `src/components/prompts/`；浏览器只接受本站 `/prompt-images/` 封面 URL。选择“用于创作”时，前端会把 `sourcePromptId` 带入生图请求。

## 文档维护

- 外部接入细节优先更新 [integration-guide.md](integration-guide.md)。
- 产品/验收范围更新 [前端开发任务书.md](前端开发任务书.md)。
- 视觉规范更新 [视觉设计方案.md](视觉设计方案.md)。
- 新增运行或交接信息同步更新 [README.md](README.md)。

## 交付门禁

- 至少运行 `npm run build`；涉及用户流程时运行对应的 Playwright 用例。当前 Playwright 用例和依赖尚未集成进 `package.json`，不能把本机 extraneous 安装当成干净克隆可复现的门禁。
- 区分“本地实现/验证”“已推送/合并”和“已部署/用户路径验证”，没有对应证据时不要宣称上线。
- `test-results/`、截图、日志、一次性同步脚本和计划文档先作为复核证据保留；删除前必须先汇报并获得用户确认。
