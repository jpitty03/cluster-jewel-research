import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'

vi.mock('./poeninja', () => ({
  UA: 'test-agent',
  fetchSnapshotVersion: vi.fn(async (overview = 'streamers') => `${overview}-current`),
  resolveLeagueUrl: vi.fn(async () => 'covens'),
  searchClusterHolders: vi.fn(),
  getStreamerBuilds: vi.fn(),
}))

let testDirectory: string | undefined
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (testDirectory) rmSync(testDirectory, { recursive: true, force: true })
  testDirectory = undefined
})

it.each([
  { streamer: 'Fubgun', overview: 'streamers', type: '2', version: 'streamers-current' },
  { streamer: null, overview: 'covens', type: '0', version: 'covens-current' },
])('crawls and resumes $overview jewels through the protected character route', async (scenario) => {
  vi.resetModules()
  testDirectory = mkdtempSync(join(tmpdir(), 'poeninja-character-'))
  vi.spyOn(process, 'cwd').mockReturnValue(testDirectory)
  const { searchClusterHolders } = await import('./poeninja')
  vi.mocked(searchClusterHolders).mockResolvedValue({
    version: 'streamers-current',
    expVersion: 'covens-current',
    holders: [{
      account: 'Player#1234', name: 'Jewel Character', class: 'Elementalist',
      streamerName: scenario.streamer, cjewels: 1, lcjewels: 1, mcjewels: 0, scjewels: 0,
    }],
  })
  const fetchMock = vi.fn(async (_input: string) => Response.json({
    jewels: [
      { itemData: { typeLine: 'Cobalt Jewel' } },
      { itemData: {
        typeLine: 'Large Cluster Jewel', name: 'Test Jewel', rarity: 'Rare', ilvl: 84,
        enchantMods: ['Adds 8 Passive Skills', '2 Added Passive Skills are Jewel Sockets'],
        explicitMods: ['1 Added Passive Skill is Prismatic Heart'],
      } },
    ],
  }))
  vi.stubGlobal('fetch', fetchMock)
  const { crawlToCompletion, getClusterJewels, getProgress } = await import('./clusterjewels')
  const result = await crawlToCompletion('Covens')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [request] = fetchMock.mock.calls[0]
  const url = new URL(request)
  expect(url.origin).toBe('https://poe.ninja')
  expect(url.pathname).toBe(`/api/protected/characters/poe1/builds/${scenario.version}/character`)
  expect(Object.fromEntries(url.searchParams)).toEqual({
    account: 'Player#1234', name: 'Jewel Character', overview: scenario.overview,
    type: scenario.type, timeMachine: '',
  })
  expect(result.charactersFetched).toBe(1)
  expect(result.errors).toBe(0)
  expect(result.jewels).toHaveLength(1)
  expect(result.jewels[0]).toMatchObject({
    base: 'Large Cluster Jewel', passives: 8, jewelSockets: 2,
    notables: ['Prismatic Heart'], streamer: scenario.streamer,
  })

  // Resume must retain the extracted jewel without repeating the protected request.
  const resumed = await crawlToCompletion('Covens')
  expect(resumed.jewels).toEqual(result.jewels)
  expect(fetchMock).toHaveBeenCalledTimes(1)

  // A browser failure during a stale-character refresh must preserve old jewels
  // and abort the run, rather than treating the whole remaining queue as errors.
  const { PoeNinjaBrowserError } = await import('./poeninjaHttp')
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 4 * 24 * 3600_000)
  fetchMock.mockRejectedValue(new PoeNinjaBrowserError('Verification failed'))
  await expect(crawlToCompletion('Covens')).rejects.toThrow('Verification failed')
  expect(getProgress().running).toBe(false)
  expect((await getClusterJewels('Covens')).jewels).toEqual(result.jewels)
})
