# API 集成指南

本文面向前端和下游服务，说明当前后端主要接口的调用方式。

## 基础约定

- 本地默认后端地址：`http://localhost:5049`
- 前端默认通过 Vite/Nginx 代理访问：`/api`
- Vite 开发代理将 `/api`、`/ai-images`、`/avatar` 和 `/nano-banana2-images` 转发到 `VITE_API_PROXY_TARGET`（默认 `http://localhost:5049`）
- 提示词封面使用本站 `/prompt-images/`：开发环境可由 `VITE_PROMPT_IMAGE_ROOT` 只读提供，或通过 `VITE_PROMPT_IMAGE_PROXY_TARGET` 转发
- 统一响应：

```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

受保护接口需要请求头：

```http
Authorization: Bearer <accessToken>
```

## 认证与用户

```http
POST /api/auth/login
POST /api/auth/register
POST /api/auth/register/email-code
GET /api/auth/profile
POST /api/auth/logout
PUT /api/users/{userId}/nickname
PUT /api/users/{userId}/password
POST /api/users/{userId}/avatar
Authorization: Bearer <accessToken> # profile/logout/nickname/password/avatar
```

前端登录成功后将 `accessToken` 写入 `localStorage.accessToken`，并将 `refreshToken` 写入 `localStorage.refreshToken`。请求拦截器会自动附加 `Authorization: Bearer <accessToken>`；业务请求收到 HTTP 401 时，前端先调用 `POST /api/auth/refresh` 并重试原请求。并发 401 共用同一次刷新；无 refresh token 或刷新失败时才清除本地 token 并跳转登录页。登出请求通过 `X-Refresh-Token` 请求头提交 refresh token。

注册页先读取当前生效的隐私政策和服务条款：

```http
GET /api/legal/documents/current?platform=web&locale=zh-CN
```

该接口允许匿名访问。当前只发布中文法律文档，因此注册同意固定请求并提交 `locale=zh-CN`；界面语言切换不改变用户接受的法律文档版本。前端使用响应中的 `privacyPolicy.url`、`termsOfService.url` 作为注册页协议链接，并在用户分别勾选同意后，把对应 `version` 原样提交给注册接口。任一文档缺失或接口失败时注册按钮保持禁用，不能使用前端硬编码版本绕过服务端校验。`aiProcessingNotice` 当前允许为 `null`，不参与注册。

本仓库随构建发布以下同源页面：

```text
/legal/privacy/index.html
/legal/terms/index.html
```

正式部署时先确认这两个页面可通过公网 HTTPS 匿名访问，再按后端 runbook 将其绝对 HTTPS URL 和对应版本写入 `legal_document`。前端不硬编码生产域名。

发送注册邮件验证码前，页面先调用公共图片验证码接口：

```http
GET /api/blog/comments/captcha
POST /api/auth/register/email-code
```

`GET` 响应中的 `imageBase64` 按 `mimeType` 作为图片展示。用户填写图片中的字符后，发送邮件验证码请求提交：

```json
{
  "email": "[邮箱]",
  "captchaId": "captcha-id-from-api",
  "captchaAnswer": "AB1234"
}
```

图片验证码是一次性挑战；每次发送尝试完成后前端都会刷新挑战。随后再调用 `POST /api/auth/register`，请求体当前包含：

```json
{
  "userName": "account123",
  "nickName": "Display Name",
  "password": "password",
  "email": "user@example.com",
  "emailCode": "123456",
  "acceptedPrivacyPolicy": true,
  "privacyPolicyVersion": "privacy-2026-08-13",
  "acceptedTermsOfService": true,
  "termsOfServiceVersion": "terms-2026-08-13",
  "clientPlatform": "web",
  "locale": "zh-CN"
}
```

Web 端注册账号名限制为 6-20 位，以英文字母开头，只允许英文字母和数字，且至少包含一个数字。

注册成功后前端引导用户使用账号和密码登录。隐私政策、服务条款的版本必须来自同一次当前文档响应；后端会拒绝缺少同意、版本过期或版本不匹配的请求。

当前用户资料使用 `userName`、`nickName`、`email`、`avatarUrl`、`pointBalance` 和 `isSuperAdmin` 字段。

## 用户积分

```http
GET /api/users/{userId}/point-details?pageIndex=1&pageSize=10
Authorization: Bearer <accessToken>
```

积分页通过当前用户 ID 获取积分流水；列表字段：`type`、`amount`、`description`、`date`、`balance`。

余额与签到状态优先通过以下接口获取：

```http
GET /api/points/balance
POST /api/points/sign-in
Authorization: Bearer <accessToken>
```

- `GET /api/points/balance`：返回 `availablePoints`、`hasSignedInToday` 和 `todaySignInPoints`。
- `POST /api/points/sign-in`：每日签到领取积分，成功后前端刷新余额和积分流水。
- 前端积分余额统一以 `/points/balance` 为准（侧边栏、个人设置、账号信息页、积分页共用）；积分流水中的 `balanceAfter` 只用于展示单条记录后的余额。
- 签到接口失败（如今日已签到）由后端返回非 2xx `code/message`，前端直接展示错误提示。

生图相关接口现在需要积分：余额不足时由后端返回非 2xx `code/message`，前端直接以错误提示展示，并在生成提交与任务完成后刷新 `/points/balance`。

### 积分充值

```http
GET /api/points/recharge/packages
POST /api/points/recharge/orders
POST /api/points/recharge/redeem
Authorization: Bearer <accessToken>
```

- 绘画首页右上角显示 `/points/balance` 返回的当前积分，点击“充值”进入 `/recharge`。
- 充值页按套餐接口返回的四档数据展示积分、价格、有效期、推荐标识和权益。
- 购买按钮创建待支付订单；有 `purchaseUrl` 时跳转，没有时展示订单号和待支付提示。
- 兑换成功后刷新用户资料、积分余额、积分流水和首充资格。
- 兑换码区分大小写且只能使用一次；前端不能把待支付订单标记为支付成功。

超级管理员可通过生成页批量签发自定义积分兑换码：

```http
POST /api/points/recharge/admin/codes
Authorization: Bearer <superAdminAccessToken>
Content-Type: application/json

{
  "points": 500,
  "count": 20,
  "expiresAt": "2026-09-01T00:00:00+08:00"
}
```

- `points` 范围为 1 到 1,000,000，`count` 范围为 1 到 100。
- `expiresAt` 可选；不传表示永久有效。
- 明文兑换码只在签发响应中返回一次；生成页不持久化明文，支持复制和 CSV 导出。
- 服务端仅保存兑换码的 SHA-256 哈希与掩码，核销后通过现有 `/points/recharge/redeem` 接口增加积分。

## 公开站点列表

```http
GET /api/sites/site_code
```

该接口不需要登录授权，返回所有未逻辑删除站点，用于前端获取站点编码和启用状态。

响应字段：

- `id`
- `siteName`
- `siteCode`
- `domain`
- `status`：`1` 启用，`0` 禁用
- `description`
- `sort`

示例：

```bash
curl http://localhost:5049/api/sites/site_code
```

## 博客文章

```http
GET /api/blog/articles
GET /api/blog/articles/{id}
POST /api/blog/articles
PUT /api/blog/articles/{id}
DELETE /api/blog/articles/{id}
POST /api/blog/articles/{id}/publish
```

当前博客文章接口固定绑定 `siteCode=blog`，调用方不需要传 `siteId`。

文章列表和详情返回：

- `coverUrl`：文章封面图地址，来自 `blog_article.cover_url`
- `thumbnailUrl`：列表缩略图地址，优先级为：
  1. `coverUrl`
  2. `blog_article_media` 关联到的第一张 `blog_media.url`
  3. 正文 HTML 中第一张 `<img src="...">`

创建或更新文章时，后端会解析正文 HTML 中的 `<img src="...">`，将命中 `blog_media.url` 的图片同步写入 `blog_article_media`。

前端显示正文图片时，应将文章 `content` 作为 HTML 渲染，并确保内容来源可信或经过清洗，避免 XSS。

## 博客媒体

```http
POST /api/blog/media/upload
GET /api/blog/media
DELETE /api/blog/media/{id}
```

上传返回的 `url` 可插入文章正文 `<img src="...">` 中。只有正文中的图片 URL 能匹配 `blog_media.url` 时，才会建立 `blog_article_media` 关联。

## 博客评论公开接口

```http
GET /api/blog/comments/captcha
POST /api/blog/comments/public
GET /api/blog/comments/public
```

- 提交评论前先获取验证码。
- 验证码接口返回 `captchaId`、`imageBase64`、`mimeType`、`expiresInSeconds`。
- 前端可用 `data:${mimeType};base64,${imageBase64}` 展示验证码图片。
- 提交评论时传 `captchaId` 和用户输入的 `captchaAnswer`。
- 公开评论列表只返回 `status=1` 已通过评论。

## 提示词库

```http
GET /api/prompts?pageIndex=1&pageSize=24&keyword=&searchField=all
GET /api/prompts/{id}
POST /api/prompts/{id}/events
```

- 后端这三个接口允许匿名访问；当前前端 `/prompts` 页面仍是登录后路由。
- `searchField` 支持 `all`、`title`、`prompt`；前端固定每页 24 条。
- 列表返回标题、描述、提示词预览、`sourcePosition` 和本站 `coverImageUrl`；详情返回完整 `promptText`、来源、作者和封面信息。
- 行为接口请求体为 `{ "type": "detail_view|copy|use" }`。行为记录失败不阻断查看、复制或用于创作。
- 前端仅接受同源 `/prompt-images/` 封面 URL，不直接加载 GitHub 或 YouMind 图片；封面首次失败会重试一次，仍失败则显示占位状态。
- “用于创作”会把完整提示词和 `sourcePromptId` 带入生图页。用户修改提示词后，前端会清除来源 ID；未修改时，普通生图和 Nano Banana 请求都会提交该可选字段。

提示词同步管理接口由后端提供，前端当前没有管理页面：

```http
GET /api/admin/prompt-sync/status
POST /api/admin/prompt-sync/run
POST /api/admin/prompt-sync/snapshots/{snapshotId}/activate
Authorization: Bearer <accessToken>
```

对应权限依次为 `PromptLibrary.Sync.View`、`PromptLibrary.Sync.Run` 和 `PromptLibrary.Sync.Switch`。

## AI 生图

创建生成记录 / 后台任务：

```http
POST /api/ai/images
Authorization: Bearer <accessToken>
```

Nano Banana 专用生成：

```http
POST /api/ai/images/nanoBananaImage
Authorization: Bearer <accessToken>
```

上传参考图：

```http
POST /api/ai/images/upload
Content-Type: multipart/form-data
Authorization: Bearer <accessToken>
```

查询、删除与收藏：

```http
GET /api/ai/images
GET /api/ai/images/{id}
DELETE /api/ai/images/{id}
POST /api/ai/images/{id}/favorite
Authorization: Bearer <accessToken>
```

参数选项与模型列表：

```http
GET /api/ai/images/parameters
GET /api/ai/images/models
POST /api/ai/images/parameters/resolve
Authorization: Bearer <accessToken>
```

以上接口需要登录；创建任务需要 `AiImage.Generate` 权限，列表需要 `AiImage.Page`，详情需要 `AiImage.Record.View`，删除需要 `AiImage.Record.Delete`，收藏需要 `AiImage.Favorite`。收藏接口请求体：

```json
{
  "imageUrl": "/ai-images/example.png",
  "isFavorite": true
}
```

`GET /api/ai/images` 前端当前会传 `pageIndex`、`pageSize`、`prompt`、`isFavorite`、`startDate`、`endDate` 查询参数。

参数选项由 `GET /api/ai/images/parameters` 和 `GET /api/ai/images/models` 加载；如果参数接口失败，前端仅保留分辨率、质量、画幅比例的静态兜底，不会兜底模型列表。`resolutionCode` 常用值为 `1k`、`2k`、`4k`；`qualityCode` 常用值为 `low`、`med`、`high`；`aspectRatioCode` 常用值为 `1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2`、`2:3`、`21:9`。

创建后台任务请求体：

```json
{
  "siteId": 2,
  "sourcePromptId": 1,
  "prompt": "一张写实风格博客封面图",
  "negativePrompt": null,
  "modelCode": "gpt-image-2",
  "modelName": "gpt-image-2",
  "imageCount": 1,
  "resolutionCode": "1k",
  "qualityCode": "med",
  "aspectRatioCode": "1:1",
  "referenceAssetIds": [
    "AST202608120001"
  ]
}
```

`referenceAssetIds` 与兼容字段 `referenceImageUrls` 合计最多 6 张。前端通过 `POST /api/ai/images/upload` 上传参考图后保留响应中的 `assetId`，新上传图片只提交 `referenceAssetIds`；历史或复用图片没有 Asset ID 时才提交 `referenceImageUrls`。上传控件限制 WEBP/JPG/PNG，单张最大 10MB。

当 `modelCode` 归一化后等于 `nanobanana`、`nanobanana2` 或 `nanobananapro` 时，前端改调用 `POST /api/ai/images/nanoBananaImage`：

```json
{
  "sourcePromptId": 1,
  "prompt": "一张写实风格博客封面图",
  "modelCode": "nano-banana2",
  "modelName": "nano-banana2",
  "resolutionCode": "1k",
  "aspectRatioCode": "1:1",
  "imageCount": 1,
  "imageAssetIds": [
    "AST202608120001"
  ]
}
```

Nano Banana 不提交 GPT 的 `qualityCode`；新上传图片使用 `imageAssetIds`，历史图片仍可使用兼容 `imageUrls`；后端根据 `resolutionCode` 和 `aspectRatioCode` 解析供应商尺寸。

`sourcePromptId` 为可选正整数，用于把提示词库来源归因到成功生成记录；手工输入或已修改的提示词不应提交该字段。

生成响应 `data` 可返回 `id`、`taskId`、`modelName`、`modelCode`、`prompt`、`resolutionCode`、`qualityCode`、`aspectRatioCode`、`width`、`height`、`size`、`quality`、`mimeType`、`url`、`base64`、`dataUrl`、`resultUrls`、`assets[].url`、`status`、`errorMessage`、`revisedPrompt`。前端统一解析这些兼容字段。`/api/media/ai/` 与 `/api/assets/` 私有图片会由前端携带 access token 请求并转换成临时 blob URL。

如果初始响应还未成功且存在 `id` 或 `taskId`，前端每 3 秒轮询 `GET /api/ai/images/{id}`，并把待轮询任务 ID 保存到 `localStorage.pendingAiImageTaskId` 以便刷新后恢复。`status=0` 视为处理中，`status=1` 或存在可预览图片视为成功，`status=2` 视为失败。

后台任务成功后，`ai_image_task.result_urls` 保存生成图片 URL 的 JSON 数组；记录同时保存本次任务的参数编码、计算后的 `size`、供应商 `quality` 和 `reference_image_urls`。
