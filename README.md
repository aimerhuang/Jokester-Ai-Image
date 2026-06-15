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

2. 准备环境变量：

```env
VITE_API_BASE_URL=/api
VITE_API_DOC_URL=http://localhost:5049/swagger
VITE_API_PROXY_TARGET=http://localhost:5049
VITE_DEFAULT_LOCALE=zh-CN
VITE_DEFAULT_THEME=light
```

3. 启动开发服务器：

```bash
npm run dev
```

Vite 开发代理会把 `/api`、`/ai-images`、`/avatar` 和 `/nano-banana2-images` 转发到 `http://localhost:5049`。

## 使用 pm2 启动前端

如果你想让前端常驻运行，可以使用项目根目录下的 [ecosystem.config.cjs](ecosystem.config.cjs)：

```bash
pm2 start ecosystem.config.cjs
pm2 logs jokester-ai-image-frontend
```

停止进程：

```bash
pm2 stop jokester-ai-image-frontend
pm2 delete jokester-ai-image-frontend
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
- `/images/:id/edit`：图片详情、复用参数、收藏、下载
- `/credits`：积分明细
- `/pricing`：积分套餐展示
- `/profile`：头像、昵称、密码和登出

## 文档

- [API 集成指南](integration-guide.md)
- [前端开发任务书](前端开发任务书.md)
- [视觉设计方案](视觉设计方案.md)
