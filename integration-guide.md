# API 集成指南

本文面向前端和下游服务，说明当前后端主要接口的调用方式。

## 基础约定

- 本地默认后端地址：`http://localhost:5049`
- 前端默认通过 Vite/Nginx 代理访问：`/api`
- Vite 开发代理将 `/api`、`/ai-images`、`/avatar` 和 `/nano-banana2-images` 转发到 `VITE_API_PROXY_TARGET`（默认 `http://localhost:5049`）
- 提示词封面使用本站 `/prompt-images/`：开发环境可由 `VITE_PROMPT_IMAGE_ROOT` 只读提供，或通过 `VITE_PROMPT_IMAGE_PROXY_TARGET` 转发
- 现役成功响应：

```json
{
  "code": 0,
  "message": "success",
  "requestId": "request-id",
  "data": {}
}
```

失败响应使用字符串机器码，结构为 `{ code, message, requestId, details }`。前端兼容层仍接受 `code="success"` 和数值 2xx 的旧成功响应。

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

前端登录成功后将 `accessToken` 写入 `localStorage.accessToken`，并将 `refreshToken` 写入 `localStorage.refreshToken`。请求拦截器会自动附加 `Authorization: Bearer <accessToken>`；业务请求收到 HTTP 401 时，前端先调用 `POST /api/auth/refresh`。并发 401 共用同一次刷新；普通请求在刷新成功后重试，无 refresh token 或刷新失败时才清除本地 token 并跳转登录页。签到、创建订单、兑换和发码不会在刷新后自动重放原业务 POST。登出请求通过 `X-Refresh-Token` 请求头提交 refresh token。

隐私政策、服务条款和 AI 数据处理告知通过独立接口读取：

```http
GET /api/legal/documents/current?platform=web&locale=zh-CN
```

该接口允许匿名访问，用于展示当前法律文档和取得 AI processing 告知。注册不以该接口为前置条件，也不提交隐私政策、服务条款或 AI 告知的接受字段与版本号。`aiProcessingNotice` 仍用于首次生图时的独立授权。

本仓库随构建发布以下同源页面：

```text
/legal/privacy/index.html
/legal/terms/index.html
/legal/ai-processing/index.html
```

正式部署时先确认三个页面可通过公网 HTTPS 匿名访问，再按后端 runbook 将其绝对 HTTPS URL 和对应版本写入 `legal_document`。前端不硬编码生产域名。

注册页直接调用邮件验证码接口：

```http
POST /api/auth/register/email-code
```

请求体只包含邮箱：

```json
{
  "email": "[邮箱]"
}
```

发送成功后，页面按响应中的 `retryAfterSeconds` 倒计时。注册流程不获取图片验证码。随后再调用 `POST /api/auth/register`，请求体只包含：

```json
{
  "email": "user@example.com",
  "emailCode": "123456",
  "password": "password"
}
```

后端按规范化邮箱 `@` 前的账号部分生成 `userName` 和 `nickName`，用户名冲突时自动消歧。注册成功后前端引导用户直接使用邮箱和密码登录。

AI 生图授权是注册后的独立流程。首次创建任务缺少当前模型 Provider 授权时，后端返回 HTTP 412 和 `AI_CONSENT_REQUIRED`；前端重新读取 `GET /api/legal/documents/current?platform=web&locale=zh-CN`，展示 `aiProcessingNotice.url`，用户确认后提交：

```http
PUT /api/users/me/consents/ai-processing
Authorization: Bearer <accessToken>
```

```json
{
  "accepted": true,
  "documentVersion": "ai-processing-2026-08-14",
  "providerCodes": ["openai", "google"],
  "clientPlatform": "web"
}
```

授权成功后自动重试原生图请求。后续请求复用当前授权，只有告知版本或实际 Provider 要求变化时才再次确认。

当前用户资料使用 `userName`、`nickName`、`email`、`avatarUrl`、`pointBalance` 和 `isSuperAdmin` 字段。动态月卡 VIP 标识还要求登录、Token 刷新和 `GET /api/auth/profile` 返回一致的权威会员状态：

```json
{
  "membership": {
    "tierCode": "monthly_vip",
    "status": "active",
    "expiresAt": "2026-09-19T05:56:52Z"
  }
}
```

没有有效权益时返回 `membership: null` 或省略该兼容字段。前端只在 `tierCode=monthly_vip`、`status=active` 且 `expiresAt` 晚于当前时间时展示徽标，并在到期时自动隐藏；不得根据积分余额、限时积分、到账数额或流水备注推断 VIP。月卡兑换成功后现有流程会重新拉取 profile，因此后端权益入账与 profile 查询完成后无需刷新页面即可点亮标识。

## 用户积分

```http
GET /api/points/balance
GET /api/points/details?pageIndex=1&pageSize=20
POST /api/points/sign-in
Authorization: Bearer <accessToken>
```

- `GET /api/points/balance`：返回 `availablePoints`、`permanentPoints`、`expiringPoints`、`nextExpiringPoints`、`nextExpireAt`、`hasSignedInToday` 和 `todaySignInPoints`。`expiringPoints` 是全部限时积分，`nextExpiringPoints` 只代表最近到期时点涉及的积分。
- `GET /api/points/details`：按创建时间倒序返回积分流水，列表字段为 `id`、`userId`、`changePoints`、`balanceAfter`、`changeType`、`source`、`remark`、`createdAt`。未知 `source` 和 `changePoints=0` 的结算记录也必须保留展示。
- `POST /api/points/sign-in`：每日签到领取积分，返回 `points`、`expireAt` 和 `availablePoints`；成功后前端刷新余额和积分流水。
- 前端积分余额统一以 `/points/balance` 为准（侧边栏、个人设置、账号信息页、积分页共用）；权威余额首次成功加载前，侧边栏等全局入口使用当前 profile 的 `pointBalance` 首屏快照，不能把加载中或加载失败显示成 0。积分流水中的 `balanceAfter` 只用于展示单条记录后的余额。
- 积分中心进入、页面回到前台以及积分变更后都会刷新余额；时间按用户本地时区展示。
- 签到接口失败（如今日已签到）后前端刷新余额与流水，并使用本地化提示，不直接透传服务端文案；积分页会附带可用的 `requestId`，顶部全局签到入口当前尚未展示该字段。

生图固定优先使用限时套餐积分，其次使用当日签到积分，最后使用永久积分；实际批次扣减和失败结算均由后端决定。

### 积分充值

```http
GET /api/points/recharge/packages?platform=web
POST /api/points/recharge/orders
POST /api/points/recharge/redeem
Authorization: Bearer <accessToken>
```

- 绘画首页右上角显示 `/points/balance` 返回的当前积分，点击“充值”进入 `/recharge`。
- 套餐接口的 `platform` 支持 `web`、`android`、`ios`。当前 Web 只接受 `monthly`、`trial`、`basic`、`value` 四个产品 code；充值页按 `sort` 排列，使用服务端返回的 `name`、`description`、`points`、`priceAmount`、`currency`、`benefits`、`badgeCode`、`isFeatured`、`isFirstPurchaseEligible` 和 `purchaseEnabled`，不得用静态内容兜底。Web 当前不读取 `priceMinorUnits` 或动态 `validityDays`。
- `monthly` 的前端合同固定为 5000 积分、到账后 30 天有效；其余展示值以接口为准。`trial` 使用当前用户的 `points` 和首充资格。
- 购买按钮创建待支付订单；有 `purchaseUrl` 时跳转，没有时展示订单号和待支付提示。
- `purchaseEnabled=false` 时禁用购买。创建订单只提交 `{ "packageCode": "..." }`，不代表支付成功，也不会直接增加积分。
- 兑换成功后刷新用户资料、积分余额、积分流水和首充资格。
- 兑换码区分大小写且只能使用一次；前端不能把待支付订单标记为支付成功。

超级管理员可通过生成页按套餐或自定义积分签发兑换码，两种请求严格互斥：

```http
POST /api/points/recharge/admin/codes
Authorization: Bearer <superAdminAccessToken>
Content-Type: application/json

{
  "packageCode": "monthly",
  "count": 1,
  "orderNo": "optional-order-number",
  "expiresAt": "2026-09-01T00:00:00+08:00"
}

或

{
  "points": 500,
  "count": 20,
  "expiresAt": "2026-09-01T00:00:00+08:00"
}
```

- 套餐模式只提交 `packageCode`，不提交 `points`；自定义模式只提交 `points`，不能提交 `packageCode` 或 `orderNo`。
- `orderNo` 仅套餐模式可用，有值时 `count` 必须为 1。
- `points` 范围为 1 到 1,000,000，`count` 范围为 1 到 100。
- `expiresAt` 可选，表示“兑换码截止核销时间”，不是到账积分的有效期。
- 明文兑换码只在签发响应中返回一次；生成页以阻断弹窗展示，支持单条复制、复制全部和 TXT 导出，用户确认已安全保存后才能关闭。关闭时清除内存中的明文，不写入 URL、本地存储或日志。
- 签到、发码、创建订单和兑换均不自动重放原业务 POST。发码、创建订单和兑换在网络结果未知时锁定当前操作并要求人工核对或刷新余额/流水；签到会重新开放按钮并刷新余额与流水进行核对。
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
- “用于创作”会把完整提示词和 `sourcePromptId` 带入生图页。用户修改提示词后，前端会清除来源 ID；未修改时，统一创建请求会提交该可选字段。

提示词同步管理接口由后端提供，前端当前没有管理页面：

```http
GET /api/admin/prompt-sync/status
POST /api/admin/prompt-sync/run
POST /api/admin/prompt-sync/snapshots/{snapshotId}/activate
Authorization: Bearer <accessToken>
```

对应权限依次为 `PromptLibrary.Sync.View`、`PromptLibrary.Sync.Run` 和 `PromptLibrary.Sync.Switch`。

## AI 生图

统一创建生成记录 / 后台任务：

```http
POST /api/ai/images
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
GET /api/ai/images/pricing-options
POST /api/ai/images/parameters/resolve
Authorization: Bearer <accessToken>
X-Client-Capabilities: ai-size-mode-v1
X-Client-Platform: web
X-Client-Version: <semver>
X-Client-Build: <build-id>
```

以上接口需要登录；创建任务需要 `AiImage.Generate` 权限，列表需要 `AiImage.Page`，详情需要 `AiImage.Record.View`，删除需要 `AiImage.Record.Delete`，收藏需要 `AiImage.Favorite`。收藏接口请求体：

```json
{
  "imageUrl": "/ai-images/example.png",
  "isFavorite": true
}
```

`GET /api/ai/images` 前端当前会传 `pageIndex`、`pageSize`、`prompt`、`modelName`、`isFavorite`、`startDate`、`endDate` 查询参数。

`GET /api/ai/images/models` 是模型能力的唯一来源；`/parameters` 只提供显示标签和显式尺寸算法元数据，不能为模型补出比例或尺寸模式。模型能力缺失、空列表或请求失败时，前端可保留旧数据只读展示，但生成必须 fail-closed。`supportedImageCounts` 的最大值约束连续的 `1..max` 数量选项，Web 产品上限为 4。`sizeContractVersion=size-mode-v1` 时读取模型级 `catalogVersion`、`capabilities.sizeModes/defaultSizeMode`；`legacy-aspect-auto` 仍按模型级 `aspectRatios` 解释 Nano/Gemini auto。

GPT explicit 分辨率 UI 固定按 `1K、2K、4K` 排列；前端会先规范化模型和参数目录的顺序，再与当前 catalog 的 explicit 价格取交集。后端返回乱序、缺档或多余编码时不得把 `2K` 挪出中间，也不得凭本地 fallback 扩大模型能力。

新协议按刚读取的 `(modelCode, catalogVersion)` 请求 `GET /api/ai/images/pricing-options?modelCode=...&catalogVersion=...`，响应 envelope 必须回显同一模型和 catalog。explicit 价格按 `sizeMode + resolutionCode + qualityCode` 匹配，auto 价格按 `sizeMode + qualityCode` 匹配；版本不一致、模式无价格或当前画质无价格时禁止生成。legacy Nano/Gemini 继续读取旧扁平数组并按业务分辨率计价。单张积分乘 `imageCount` 后与 `/api/points/balance` 比较，最终扣分仍以后端创建事务为准。

`size-mode-v1` 显式尺寸请求体：

```json
{
  "idempotencyKey": "8be9f310-c370-4f41-bad8-6f5eb4a25f49",
  "sourcePromptId": 1,
  "prompt": "一张写实风格博客封面图",
  "negativePrompt": null,
  "modelCode": "gpt-image-2",
  "modelName": "gpt-image-2",
  "imageCount": 1,
  "sizeMode": "explicit",
  "catalogVersion": "imgcat_20260821_01",
  "resolutionCode": "1k",
  "qualityCode": "med",
  "aspectRatioCode": "1:1",
  "referenceAssetIds": [
    "AST202608120001"
  ]
}
```

自动尺寸使用同一入口，但只提交模式、catalog 和模型支持且有 auto 价格的质量；`resolutionCode` 与 `aspectRatioCode` 必须完全省略：

```json
{
  "idempotencyKey": "8be9f310-c370-4f41-bad8-6f5eb4a25f49",
  "prompt": "一张写实风格博客封面图",
  "modelCode": "gpt-image-2",
  "modelName": "gpt-image-2",
  "imageCount": 1,
  "sizeMode": "auto",
  "catalogVersion": "imgcat_20260821_01",
  "qualityCode": "med",
  "referenceAssetIds": []
}
```

`referenceAssetIds` 与兼容字段 `referenceImageUrls` 合计最多 6 张。前端通过 `POST /api/ai/images/upload` 上传参考图后保留响应中的 `assetId`，新上传图片只提交 `referenceAssetIds`；历史或复用图片没有 Asset ID 时才提交 `referenceImageUrls`。上传控件限制 WEBP/JPG/PNG，单张最大 10MB。

首页对 Banana/Gemini 模型仍统一调用 `POST /api/ai/images`，后端根据模型配置的 Provider protocol 路由。请求使用通用参考图字段，并省略 GPT 专属的 `qualityCode`：

```json
{
  "idempotencyKey": "8be9f310-c370-4f41-bad8-6f5eb4a25f49",
  "sourcePromptId": 1,
  "prompt": "一张写实风格博客封面图",
  "modelCode": "nano-banana-2",
  "modelName": "nano-banana-2",
  "resolutionCode": "1k",
  "aspectRatioCode": "1:1",
  "imageCount": 1,
  "referenceAssetIds": [
    "AST202608120001"
  ]
}
```

未迁移的 Nano Banana 不提交 `sizeMode`、`catalogVersion` 或 GPT 的 `qualityCode`；legacy auto 继续同时提交业务 `resolutionCode` 和 `aspectRatioCode=auto`。新上传图片使用 `referenceAssetIds`，历史图片仍可使用兼容 `referenceImageUrls`。

`idempotencyKey` 必填。相同客户端意图在结果未知时复用同一个 key；auto 指纹包含 `sizeMode` 但不包含被省略的分辨率/比例，explicit 指纹包含模式、分辨率和比例，`catalogVersion` 不参与客户端意图指纹。创建结果已知或发生 `IDEMPOTENCY_CONFLICT` 后清除当前 key。`sourcePromptId` 为可选正整数，用于把提示词库来源归因到成功生成记录。

新任务响应使用 `sizeContractVersion/modelCode/sizeMode/catalogVersion` 区分语义；`requested*` 表示请求尺寸，`outputWidth/outputHeight/outputSize` 只表示服务端真实解码后的输出尺寸。新 auto 活动任务的输出尺寸为空，旧 `width/height` 兼容占位即使为 0 也不得展示为 `0x0`。成功后展示实际输出尺寸。前端继续兼容 `url/base64/dataUrl/resultUrls/assets[].url/results[].url`，私有媒体由前端携带 access token 转换为 blob URL。

如果初始响应还未成功且存在 `taskIds`、`ids`、`taskId` 或 `id`，前端并行轮询各个 `GET /api/ai/images/{id}`，并把待轮询任务 ID 列表保存到 `localStorage.pendingAiImageTaskId` 以便刷新后恢复；旧版单 ID 数据仍可读取。首页按请求的 `imageCount` 创建固定结果槽位，单个任务完成后立即展示图片，其余槽位继续加载。优先采用响应的 `pollAfterSeconds`；缺失时排队状态默认 3 秒、处理中默认 5 秒。优先采用响应的 `expiresAt`；缺失时按每张 5 分钟、最长 10 分钟兜底。创建前会短超时读取最近 100 个任务作为 ID 基线；创建结果未知且没有任务 ID 时，按当前用户保存会话级恢复标记并跳转任务历史。恢复指纹除提示词、稳定 `modelCode`、数量、质量、来源和参考图数量外，还按 contract 比较尺寸：新 auto 只比较 `sizeMode=auto`，新 explicit 比较模式、请求分辨率和比例，legacy 继续比较业务分辨率与比例；不比较 catalog、具体 Asset ID 或 URL。仅发现基线外且指纹匹配的新终态任务时结束恢复，基线读取失败时不猜测旧任务。

创建任务后以及任务成功、失败或超时进入最终状态后，前端都会刷新余额和积分流水。任务列表和详情展示 `pointCost` 与 `billingStatus`（预留、确认扣除、部分退款、全额退款结算）；账务状态不等于可用余额增加相同数额，失败文案以最新余额和明细为准，不承诺全额退回可用余额。

任务详情先按 `sizeContractVersion` 解释尺寸；`legacy-unknown` 只读且禁止复用配置，`legacy-aspect-auto` 复用时保留业务分辨率和 auto 比例，`size-mode-v1` auto 复用时不恢复分辨率或比例。
