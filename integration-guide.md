# API 集成指南

本文面向前端和下游服务，说明当前后端主要接口的调用方式。

## 基础约定

- 本地默认后端地址：`http://localhost:5049`
- 前端默认通过 Vite/Nginx 代理访问：`/api`
- Vite 开发代理同时转发 `/api` 和 `/ai-images` 到 `http://localhost:5049`
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
PUT /api/Users/{userId}/password
POST /api/users/{userId}/avatar
Authorization: Bearer <accessToken> # profile/logout/nickname/password/avatar
```

前端登录成功后将 `accessToken` 写入 `localStorage.accessToken`，如果后端返回 `refreshToken`，同时写入 `localStorage.refreshToken`。请求拦截器会自动附加 `Authorization: Bearer <accessToken>`；收到 HTTP 401 时会清除本地 token 并跳转登录页。

注册流程先调用 `POST /api/auth/register/email-code` 发送邮箱验证码，再调用 `POST /api/auth/register`，请求体当前包含：

```json
{
  "email": "user@example.com",
  "username": "user@example.com",
  "nickname": "user@example.com",
  "password": "password",
  "EmailCode": "123456"
}
```

注册成功后前端会清空会话并引导用户重新登录。

用户资料字段前端会兼容常见别名：邮箱 `email/emailAddress/mail`，昵称 `displayName/nickname/name`，头像 `avatarUrl/avatarURL/avatar_url/avatar`，积分 `credits/credit/balance`。

## 用户积分

```http
GET /api/Users/{userId}/point-details?pageIndex=1&pageSize=10
Authorization: Bearer <accessToken>
```

积分页通过当前用户 ID 获取积分流水；列表字段：`type`、`amount`、`description`、`date`、`balance`。

余额与签到状态优先通过以下接口获取：

```http
GET /api/points/balance
POST /api/points/sign-in
Authorization: Bearer <accessToken>
```

- `GET /api/points/balance`：返回当前用户积分余额和今日签到状态。前端归一化余额字段（兼容 `balance/points/point/credits/credit`）和签到状态字段（兼容 `checkedInToday/isCheckedInToday/signedInToday/isSignedInToday/todayCheckedIn/hasSignedInToday`）。
- `POST /api/points/sign-in`：每日签到领取积分，成功后前端刷新余额和积分流水。
- 前端积分余额统一以 `/points/balance` 为准（侧边栏、个人设置、账号信息页、积分页共用），`/Users/{userId}/point-details` 第一条记录的 `balance` 仅作为兜底。
- 签到接口失败（如今日已签到）由后端返回非 2xx `code/message`，前端直接展示错误提示。

生图相关接口现在需要积分：余额不足时由后端返回非 2xx `code/message`，前端直接以错误提示展示，并在生成提交与任务完成后刷新 `/points/balance`。

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

以上接口需要登录；创建任务需要 `AiImage.Generate` 权限，记录查询需要 `AiImage.Record.View`，删除需要 `AiImage.Record.Delete`。收藏接口请求体：

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
  "prompt": "一张写实风格博客封面图",
  "negativePrompt": null,
  "modelName": "",
  "imageCount": 1,
  "resolutionCode": "1k",
  "qualityCode": "med",
  "aspectRatioCode": "1:1",
  "referenceImageUrls": [
    "/uploads/reference-1.png"
  ]
}
```

`referenceImageUrls` 是可选 JSON 数组，最多 6 张；前端应先通过 `POST /api/ai/images/upload` 上传参考图，拿到 URL 后再点击生图按钮。上传控件限制 WEBP/JPG/PNG，单张最大 10MB。

当 `modelName` 归一化后等于 `nanobanana` 或 `nanobanana2` 时，前端改调用 `POST /api/ai/images/nanoBananaImage`：

```json
{
  "prompt": "一张写实风格博客封面图",
  "size": "1024x1024",
  "quality": "medium",
  "imageUrls": [
    "/uploads/reference-1.png"
  ]
}
```

Nano Banana 的 `size` 由 `resolutionCode` 长边和 `aspectRatioCode` 计算；`med` 会映射成 `medium`。

生成响应 `data` 可返回 `id`、`taskId`、`modelName`、`prompt`、`resolutionCode`、`qualityCode`、`aspectRatioCode`、`width`、`height`、`size`、`quality`、`mimeType`、`url`、`base64`、`dataUrl`、`resultUrls`、`status`、`errorMessage`、`revisedPrompt`。前端预览优先级：`url` → `dataUrl` → `resultUrls[0]` → `base64` 拼出的 data URL。

如果初始响应还未成功且存在 `id` 或 `taskId`，前端每 3 秒轮询 `GET /api/ai/images/{id}`，并把待轮询任务 ID 保存到 `localStorage.pendingAiImageTaskId` 以便刷新后恢复。`status=0` 视为处理中，`status=1` 或存在可预览图片视为成功，`status=2` 视为失败。

后台任务成功后，`ai_image_task.result_urls` 保存生成图片 URL 的 JSON 数组；记录同时保存本次任务的参数编码、计算后的 `size`、供应商 `quality` 和 `reference_image_urls`。