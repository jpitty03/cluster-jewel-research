import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { getStreamerBuilds } from './server/poeninja'
import {
  charactersCsv,
  ensureCharactersCsv,
  getClusterJewels,
  getProgress,
  stopCrawl,
} from './server/clusterjewels'

// Dev-server API: scrapes poe.ninja server-side (avoids CORS, keeps parsing off the client)
function poeNinjaApi(): Plugin {
  const json = (res: import('node:http').ServerResponse, status: number, body: unknown) => {
    res.statusCode = status
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify(body))
  }

  return {
    name: 'poe-ninja-api',
    configureServer(server) {
      server.middlewares.use('/api/streamers', async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const data = await getStreamerBuilds(url.searchParams.has('refresh'))
          json(res, 200, data)
        } catch (err) {
          json(res, 502, { error: String(err) })
        }
      })

      server.middlewares.use('/api/cluster-jewels', async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (url.pathname === '/progress') {
          return json(res, 200, getProgress())
        }
        if (url.pathname === '/stop') {
          stopCrawl()
          return json(res, 200, getProgress())
        }
        try {
          const mode = url.searchParams.has('full')
            ? 'full'
            : url.searchParams.has('refresh')
              ? 'resume'
              : 'cache'
          const data = await getClusterJewels(mode)
          json(res, 200, data)
        } catch (err) {
          json(res, 502, { error: String(err) })
        }
      })

      server.middlewares.use('/api/characters.csv', async (_req, res) => {
        try {
          let csv = charactersCsv()
          if (!csv) {
            await ensureCharactersCsv()
            csv = charactersCsv()
          }
          res.setHeader('content-type', 'text/csv')
          res.setHeader('content-disposition', 'attachment; filename="characters.csv"')
          res.end(csv ?? '')
        } catch (err) {
          json(res, 502, { error: String(err) })
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the static build works under a GitHub Pages project sub-path
  // (user.github.io/<repo>/) without hardcoding the repo name.
  base: './',
  plugins: [react(), poeNinjaApi()],
})
