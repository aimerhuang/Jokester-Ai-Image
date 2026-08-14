# Jokester AI Image

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

## 使用 pm2 启动前端

如果你想让前端常驻运行，可以使用项目根目录下的 [ecosystem.config.cjs](ecosystem.config.cjs)：

```bash
pm2 start ecosystem.config.cjs
pm2 logs jokester-ai-image
```

停止进程：

```bash
pm2 stop jokester-ai-image
pm2 delete jokester-ai-image
```

## 常用命令

```bash
npm run dev      # 启动开发服务器
npm run build    # 类型检查并构建生产包
npm run preview  # 预览生产构建
```

## 主要路由

- `/login`：登录
- `/register`：邮箱验证码注册
- `/playground`：AI 生图工作台
- `/images`：我的画廊
- `/prompts`：提示词库、搜索、复制和用于创作
- `/images/:id/edit`：图片详情、复用参数、收藏、下载
- `/credits`：积分明细
- `/pricing`：积分套餐展示
- `/recharge`：积分充值、创建订单和兑换充值卡密
- `/admin/redeem-codes`：超级管理员按积分面值批量签发兑换码
- `/profile`：头像、昵称、密码和登出

## 法律文档

- `/legal/privacy/index.html`：隐私政策静态页面
- `/legal/terms/index.html`：服务条款静态页面

源文件位于 `public/legal/`，`npm run build` 后会原样进入 `dist/legal/`。注册页从 `GET /api/legal/documents/current?platform=web&locale=zh-CN` 读取当前版本和 URL，登录、注册及登录后侧栏也提供同源法律页面入口。部署时必须先发布静态页面，再按后端 runbook 配置同一版本的绝对 HTTPS URL。

第三方 AI 数据处理告知当前不发布。后端返回 `aiProcessingNotice=null` 时注册仍可使用，但生图必须保持不可用；不能由前端隐藏错误或绕过服务端检查。

## 文档

- [API 集成指南](integration-guide.md)
- [前端开发任务书](前端开发任务书.md)
- [视觉设计方案](视觉设计方案.md)
