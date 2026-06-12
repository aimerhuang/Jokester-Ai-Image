# CLAUDE.md

## 项目概况

Jokester AI Image 是一个 Vue 3 + Vite + TypeScript 前端项目，用于 AI 生图、图库、积分和账号管理。当前目录不是 git 仓库。

## 开发命令

```bash
npm install
npm run dev
npm run build
npm run preview
```

`npm run build` 会先执行 `vue-tsc -b`，再执行 `vite build`。

## 环境变量

见 `.env.example`：

```env
VITE_API_BASE_URL=/api
VITE_API_DOC_URL=http://localhost:5049/swagger
VITE_DEFAULT_LOCALE=zh-CN
VITE_DEFAULT_THEME=light
```

开发代理在 [vite.config.ts](vite.config.ts) 中配置：`/api` 和 `/ai-images` 都转发到 `http://localhost:5049`。

## 源码结构

- [src/router/index.ts](src/router/index.ts)：路由与登录守卫
- [src/services/](src/services/)：Axios 封装和业务 API
- [src/stores/](src/stores/)：Pinia 状态，包括登录态、语言主题、积分、生图参数
- [src/views/](src/views/)：页面组件
- [src/components/](src/components/)：通用组件和图片组件
- [src/locales/](src/locales/)：中英文静态文案
- [src/styles/](src/styles/)：设计 token 和全局样式

## 主要路由

受保护路由统一由 [src/layouts/AppLayout.vue](src/layouts/AppLayout.vue) 包裹，未登录会跳转 `/login`。

- `/login`
- `/register`
- `/playground`
- `/images`
- `/images/:id/edit`
- `/credits`
- `/pricing`
- `/profile`

## API 约定

- Axios 实例在 [src/services/http.ts](src/services/http.ts)，`baseURL` 默认为 `VITE_API_BASE_URL || '/api'`。
- 登录 token 保存在 `localStorage.accessToken`；如果返回 refresh token，保存在 `localStorage.refreshToken`。
- 请求拦截器自动附加 `Authorization: Bearer <accessToken>`。
- HTTP 401 会清 token 并派发 `auth:expired`，路由层监听后跳转登录页。
- 后端统一响应按 `{ code, message, data }` 解包；非 2xx code 会作为 `ApiError` 抛出。

## 生图实现要点

- 参数与模型：`GET /api/ai/images/parameters` + `GET /api/ai/images/models`，实现位于 [src/stores/imageOptions.ts](src/stores/imageOptions.ts)。
- 参考图上传：`POST /api/ai/images/upload`，控件位于 [src/components/images/ReferenceUploader.vue](src/components/images/ReferenceUploader.vue)，支持点击、拖拽、粘贴；限制 WEBP/JPG/PNG、最多 6 张、单张最大 10MB。
- 默认生成：`POST /api/ai/images`。
- Nano Banana：当 `modelName` 归一化后等于 `nanobanana` 或 `nanobanana2`，前端调用 `POST /api/ai/images/nanoBananaImage`，并把 `resolutionCode + aspectRatioCode` 转成 `size`。
- 生成后如果返回 `id` 或 `taskId` 且未成功，前端每 3 秒轮询 `GET /api/ai/images/{id}`；待轮询 ID 保存在 `localStorage.pendingAiImageTaskId`。
- 图片预览 URL 优先级：`url` → `dataUrl` → `resultUrls[0]` → `base64`。

## 用户、积分与资料

- 登录、注册、邮箱验证码、profile、logout 位于 [src/services/auth.ts](src/services/auth.ts)。
- 昵称、密码、头像接口位于 [src/services/user.ts](src/services/user.ts)。注意当前代码中密码接口路径是 `/Users/{userId}/password`，昵称和头像路径是 `/users/{userId}/...`。
- 积分接口位于 [src/services/credits.ts](src/services/credits.ts)，当前通过 `GET /Users/{userId}/point-details` 拉流水，并用第一条记录的 `balance` 作为余额。

## 文档维护

- 外部接入细节优先更新 [integration-guide.md](integration-guide.md)。
- 产品/验收范围更新 [前端开发任务书.md](前端开发任务书.md)。
- 视觉规范更新 [视觉设计方案.md](视觉设计方案.md)。
- 新增运行或交接信息同步更新 [README.md](README.md)。
