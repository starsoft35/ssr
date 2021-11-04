import { resolve } from 'path'
import { loadConfig, getCwd, StringToStream, mergeStream2 } from 'ssr-server-utils'
import { renderToNodeStream, renderToString } from '@vue/server-renderer'
import { ISSRContext, UserConfig, ExpressContext, IConfig } from 'ssr-types'

const cwd = getCwd()
const defaultConfig = loadConfig()

function render (ctx: ISSRContext, options?: UserConfig): Promise<string>
function render<T> (ctx: ISSRContext, options?: UserConfig): Promise<T>

async function render (ctx: ISSRContext, options?: UserConfig) {
  const config = Object.assign({}, defaultConfig, options ?? {})
  const { stream } = config
  const isVite = process.env['BUILD_TOOL'] === 'vite'

  if (!ctx.response.type && typeof ctx.response.type !== 'function') {
    // midway/koa 场景设置默认 content-type
    ctx.response.type = 'text/html;charset=utf-8'
  } else if (!(ctx as ExpressContext).response.hasHeader?.('content-type')) {
    // express 场景
    (ctx as ExpressContext).response.setHeader?.('Content-type', 'text/html;charset=utf-8')
  }

  const serverRes = isVite ? await viteRender(ctx, config) : await commonRender(ctx, config)
  if (stream) {
    const stream = mergeStream2(new StringToStream('<!DOCTYPE html>'), renderToNodeStream(serverRes))
    stream.on('error', (e: any) => {
      console.log(e)
    })
    return stream
  } else {
    return `<!DOCTYPE html>${await renderToString(serverRes)}`
  }
}

async function viteRender (ctx: ISSRContext, config: IConfig) {
  const { createServer } = await import('vite')
  const viteServer = await createServer({
    configFile: resolve(getCwd(), './vite.server.config.js')
  })

  const { serverRender } = await viteServer.ssrLoadModule(resolve(cwd, './node_modules/ssr-plugin-vue3/esm/entry/server-entry'))
  const serverRes = await serverRender(ctx, config)
  return serverRes
}

async function commonRender (ctx: ISSRContext, config: IConfig) {
  const { isDev, chunkName } = config
  const isLocal = isDev || process.env.NODE_ENV !== 'production'
  const serverFile = resolve(cwd, `./build/server/${chunkName}.server.js`)

  if (isLocal) {
    // clear cache in development environment
    delete require.cache[serverFile]
  }

  const { serverRender } = require(serverFile)
  const serverRes = await serverRender(ctx, config)
  return serverRes
}

export { render }
