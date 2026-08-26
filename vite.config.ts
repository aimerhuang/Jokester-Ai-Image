import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname, isAbsolute, relative, resolve, sep } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'

const PROMPT_IMAGE_PATH_PREFIX = '/prompt-images/'
const PROMPT_IMAGE_CONTENT_TYPES = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
])

function promptImageFiles(root: string): Plugin {
  const imageRoot = resolve(root)

  return {
    name: 'prompt-image-files',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        let pathname = ''
        try {
          pathname = decodeURIComponent((request.url || '/').split('?', 1)[0])
        } catch {
          return next()
        }

        if (!pathname.startsWith(PROMPT_IMAGE_PATH_PREFIX)) return next()
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          response.statusCode = 405
          response.setHeader('Allow', 'GET, HEAD')
          response.end()
          return
        }

        const requestedPath = pathname.slice(PROMPT_IMAGE_PATH_PREFIX.length)
        const filePath = resolve(imageRoot, requestedPath)
        const relativePath = relative(imageRoot, filePath)
        const contentType = PROMPT_IMAGE_CONTENT_TYPES.get(extname(filePath).toLowerCase())
        if (
          !requestedPath
          || !relativePath
          || relativePath === '..'
          || relativePath.startsWith(`..${sep}`)
          || isAbsolute(relativePath)
          || !contentType
        ) {
          response.statusCode = 404
          response.end()
          return
        }

        try {
          const file = await stat(filePath)
          if (!file.isFile()) throw new Error('Not a file')

          response.statusCode = 200
          response.setHeader('Content-Type', contentType)
          response.setHeader('Content-Length', file.size)
          response.setHeader('Cache-Control', 'no-cache')
          response.setHeader('X-Content-Type-Options', 'nosniff')
          if (request.method === 'HEAD') {
            response.end()
            return
          }

          const stream = createReadStream(filePath)
          stream.on('error', (error) => response.destroy(error))
          stream.pipe(response)
        } catch {
          response.statusCode = 404
          response.end()
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const promptImageProxyTarget = env.VITE_PROMPT_IMAGE_PROXY_TARGET?.trim()
  const promptImageRoot = (env.VITE_PROMPT_IMAGE_ROOT || env.PROMPT_IMAGE_ROOT)?.trim()
  const clientVersion = env.VITE_CLIENT_VERSION?.trim() || '0.1.0'
  const clientBuild = env.VITE_CLIENT_BUILD?.trim()
    || process.env.GITHUB_SHA?.trim()
    || new Date().toISOString().replace(/[-:.TZ]/g, '')

  return {
    plugins: [
      vue(),
      ...(!promptImageProxyTarget && promptImageRoot ? [promptImageFiles(promptImageRoot)] : []),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    define: {
      __APP_VERSION__: JSON.stringify(clientVersion),
      __APP_BUILD__: JSON.stringify(clientBuild),
    },
    build: {
      chunkSizeWarningLimit: 800,
    },
    server: {
      host: true,
      proxy: {
        '/api/avatar': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:5049',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/avatar/, '/avatar'),
        },
        '/api': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:5049',
          changeOrigin: true,
        },
        ...(promptImageProxyTarget ? {
          '/prompt-images': {
            target: promptImageProxyTarget,
            changeOrigin: true,
          },
        } : {}),
        '/ai-images': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:5049',
          changeOrigin: true,
        },
        '/nano-banana2-images': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:5049',
          changeOrigin: true,
        },
        '/avatar': {
          target: env.VITE_API_PROXY_TARGET || 'http://localhost:5049',
          changeOrigin: true,
        },
      },
    },
  }
})
