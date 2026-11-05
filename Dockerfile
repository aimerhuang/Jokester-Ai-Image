ARG NODE_IMAGE=node:24-alpine
ARG NGINX_IMAGE=nginx:1.28-alpine

FROM ${NODE_IMAGE} AS build
WORKDIR /src

ARG NPM_REGISTRY=
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    npm_config_fund=false \
    npm_config_audit=false

COPY package.json package-lock.json ./
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi \
    && npm ci

COPY . .

# Vite 只在构建期读取 VITE_*，镜像运行时不能再修改这些值。
ARG VITE_API_BASE_URL=/api
ARG VITE_DEFAULT_LOCALE=zh-CN
ARG VITE_DEFAULT_THEME=light
ARG VITE_CLIENT_VERSION=0.1.0
ARG VITE_CLIENT_BUILD=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_DEFAULT_LOCALE=${VITE_DEFAULT_LOCALE} \
    VITE_DEFAULT_THEME=${VITE_DEFAULT_THEME} \
    VITE_CLIENT_VERSION=${VITE_CLIENT_VERSION} \
    VITE_CLIENT_BUILD=${VITE_CLIENT_BUILD}

RUN npm run build && test -f dist/index.html

FROM ${NGINX_IMAGE} AS runtime

# 运行期配置：由官方镜像的 envsubst 模板机制写入 /etc/nginx/conf.d。
ENV API_UPSTREAM=api:8080 \
    NGINX_RESOLVER=127.0.0.11 \
    APP_DOMAIN=localhost \
    TLS_MODE=off \
    REAL_IP_MODE=none \
    CLIENT_MAX_BODY_SIZE=12m \
    PROXY_READ_TIMEOUT=600s \
    TZ=Asia/Shanghai

COPY docker/nginx/templates/ /etc/nginx/templates/
COPY docker/nginx/snippets/ /etc/nginx/snippets/
COPY --from=build /src/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
    CMD wget --quiet --spider http://127.0.0.1/healthz || exit 1
