# CLAUDE.md

## 项目概况

Jo AI Image 是一个 Vue 3 + Vite + TypeScript 前端项目，用于 AI 生图、图库、积分和账号管理。

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
- HTTP 401 会先用 `localStorage.refreshToken` 调用 `POST /auth/refresh`，同一时间只发起一次刷新；普通请求在刷新成功后重试，无 refresh token 或刷新失败时才清 token、派发 `auth:expired` 并跳转登录页。签到、创建订单、兑换和发码标记为 `skipAuthRefreshReplay`：可以刷新会话，但不会自动重放原业务 POST。
- 后端现役成功响应按 `{ code: 0, message, requestId, data }` 解包；兼容层仍接受 `code='success'` 和数值 2xx。失败响应使用字符串机器码并作为 `ApiError` 抛出。

## 生图实现要点

- 参数与模型：`GET /api/ai/images/parameters` + `GET /api/ai/images/models`，实现位于 [src/stores/imageOptions.ts](src/stores/imageOptions.ts)。
- 参考图上传：`POST /api/ai/images/upload`，控件位于 [src/components/images/ReferenceUploader.vue](src/components/images/ReferenceUploader.vue)，支持点击、拖拽、粘贴；限制 WEBP/JPG/PNG、最多 6 张、单张最大 10MB。新上传图片保留响应中的 `assetId`，创建任务优先提交 `referenceAssetIds`；只有历史/复用图片继续走 `referenceImageUrls` 兼容字段。
- 创建任务统一调用 `POST /api/ai/images`，后端按模型配置的 Provider protocol 路由 GPT Image 或 Gemini Image；当前用户流程不调用 Nano Banana 专用入口。
- 前端优先按模型列表的 `capabilities.supportsQuality` 和 `providerCode` 决定 Banana/Gemini 的参数 UI；`supportsQuality=false` 时不展示或提交 GPT 的 `qualityCode`。`supportedImageCounts` 的最大值约束连续的 `1..max` 数量选项，前端产品上限为 4；后端应返回连续能力列表。固定模型名判断只作为旧响应兼容兜底。
- Web 声明 `X-Client-Capabilities: ai-size-mode-v1` 并发送平台、版本和 build Header。`sizeContractVersion=size-mode-v1` 时严格使用模型的 `sizeModes/catalogVersion`，并按同一 catalog 读取 v2 定价 envelope；auto 请求省略分辨率和比例，explicit 请求提交两者。未迁移 Nano/Gemini 的 `legacy-aspect-auto` 仍提交业务分辨率和 `aspectRatioCode=auto`，不携带新协议字段。
- GPT explicit 分辨率展示顺序固定为 `1K、2K、4K`，使用 `sortImageResolutionCodes` 归一化模型和参数目录，不依赖后端返回顺序；可选集合仍必须取模型能力与当前 catalog 定价交集。尺寸模式 E2E 要同时断言该顺序和 auto 的显示/隐藏。
- 生成后如果返回 `taskIds`、`ids`、`taskId` 或 `id` 且未成功，前端会并行轮询各个 `GET /api/ai/images/{id}`；待轮询 ID 列表保存在 `localStorage.pendingAiImageTaskId`，并兼容旧的单 ID 数据。首页为每张图片保留独立槽位，单张完成后立即展示，其余槽位继续加载。响应未提供 `expiresAt` 时按每张 5 分钟、最长 10 分钟兜底。创建前会短超时读取最近 100 个任务作为 ID 基线；创建结果未知且拿不到任务 ID 时，前端按用户把可见任务字段指纹、基线 ID 和恢复期限写入 `sessionStorage.pendingAiImageHistoryRecovery`，跳转任务历史并在首次为空或请求失败时继续轮询。只有基线外且提示词、模型、数量、分辨率、质量、比例、来源提示词 ID 和参考图数量均匹配的新终态任务才结束恢复；基线读取失败时不猜测旧任务，持续轮询至最长 10 分钟期限。
- 创建请求必须携带 `idempotencyKey`；相同参数在 30 分钟内复用 `localStorage.pendingAiImageSubmission` 中的 key，创建请求结果已知或发生 `IDEMPOTENCY_CONFLICT` 后清除。创作表单按当前用户写入 `sessionStorage.playgroundDraft`，用于站内导航和充值返回恢复。
- 图片预览兼容 `url`、`dataUrl`、`resultUrls`、`assets[].url`、`base64` 等响应字段。`/api/media/ai/` 和 `/api/assets/` 私有图片由 `useAuthenticatedImageUrls` 携带 token 拉取为 blob URL，避免裸 `<img>` 请求丢失鉴权头。

## 用户、积分与资料

- 登录、注册、邮箱验证码、profile、logout 位于 [src/services/auth.ts](src/services/auth.ts)。
- 注册只提交邮箱、邮箱验证码和密码；AI 数据处理授权是首次生图遇到 `AI_CONSENT_REQUIRED` 后的独立流程。
- 昵称、密码、头像接口位于 [src/services/user.ts](src/services/user.ts)，统一使用 `/users/{userId}/...` 路径。
- 积分接口位于 [src/services/credits.ts](src/services/credits.ts)：余额以 `GET /points/balance` 为准，权威余额尚未成功加载时只使用当前用户 profile 的 `pointBalance` 首屏快照；`GET /points/details` 拉取流水。充值页通过带 `platform` 的 `/points/recharge/packages` 获取动态套餐，并使用 `/points/recharge/*` 下单、兑换和管理端发码接口，不维护静态套餐兜底。
- 套餐 code 固定为 `monthly`、`trial`、`basic`、`value`，名称、价格、权益、购买状态等内容由接口返回；`monthly` 的 Web 合同固定显示 5000 积分和到账后 30 天有效。`membership` 仅在 `monthly_vip + active + 未到 expiresAt` 时展示 VIP 标识。
- 提示词库位于 [src/services/prompts.ts](src/services/prompts.ts) 和 `src/components/prompts/`；浏览器只接受本站 `/prompt-images/` 封面 URL。选择“用于创作”时，前端会把 `sourcePromptId` 带入生图请求。

## 文档维护

- 外部接入细节优先更新 [integration-guide.md](integration-guide.md)。
- Web 产品/验收范围更新 [前端开发任务书.md](前端开发任务书.md)。
- 跨端产品评审输入更新 [point-package-frontend-prd.md](point-package-frontend-prd.md)，不得把它当作 Web 运行态合同。
- 视觉规范更新 [视觉设计方案.md](视觉设计方案.md)。
- 新增运行或交接信息同步更新 [README.md](README.md)。

## 交付门禁

- 至少运行 `npm run build`；涉及用户流程时运行对应的 Playwright 用例。仓库已声明 `playwright`，首次运行需执行 `npx playwright install chromium`；尺寸模式定向门禁为 `npm run test:e2e:ai-size`。
- 区分“本地实现/验证”“已推送/合并”和“已部署/用户路径验证”，没有对应证据时不要宣称上线。
- `test-results/`、截图、日志、一次性同步脚本和计划文档先作为复核证据保留；删除前必须先汇报并获得用户确认。
