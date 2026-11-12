import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../docs/poe2-crafting-engine/references/requests/morbid-siege/market/', import.meta.url);
await mkdir(root, { recursive: true });
const sources = [
  ['leagues.json', 'https://poe.ninja/poe2/api/economy/leagues'],
  ['currency.json', 'https://poe.ninja/poe2/api/economy/exchange/current/overview?league=Forbidden%20Rites&type=Currency'],
  ['omens.json', 'https://poe.ninja/poe2/api/economy/exchange/current/overview?league=Forbidden%20Rites&type=Omen'],
  ['coe.html', 'https://beta.craftofexile.com/?game=poe2'],
  ['trade-stats.json', 'https://www.pathofexile.com/api/trade2/data/stats'],
  ['coe-data.js', 'https://beta.craftofexile.com/json/poe2/4.5.5.1.5/data.json?v=1788821693'],
  ['coe-english.js', 'https://beta.craftofexile.com/json/poe2/4.5.5.1.5/localization/english.json?v=1788821693'],
  ['coe-code.js', 'https://beta.craftofexile.com/packages/files/package_poe2.js?v=1789563469'],
  ['coe-prices.js', 'https://beta.craftofexile.com/json/poe2/4.5.5.1.5/prices.json?v=1789404199'],
  ['omens-plural.json', 'https://poe.ninja/poe2/api/economy/exchange/current/overview?league=Forbidden%20Rites&type=Omens'],
  ['essences.json', 'https://poe.ninja/poe2/api/economy/exchange/current/overview?league=Forbidden%20Rites&type=Essences'],
  ['ritual.json', 'https://poe.ninja/poe2/api/economy/exchange/current/overview?league=Forbidden%20Rites&type=Ritual'],
  ['abyss.json', 'https://poe.ninja/poe2/api/economy/exchange/current/overview?league=Forbidden%20Rites&type=Abyss'],
  ['runes.json', 'https://poe.ninja/poe2/api/economy/exchange/current/overview?league=Forbidden%20Rites&type=Runes'],
];
const manifest = [];
for (const [file, url] of sources) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'Mozilla/5.0' } });
    const bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(new URL(file, root), bytes);
    manifest.push({ file, url, status: response.status, fetchedAt: new Date().toISOString(), sha256: createHash('sha256').update(bytes).digest('hex') });
    console.log(file, response.status, bytes.length, bytes.toString('utf8').slice(0, 170));
  } catch (error) { manifest.push({ file, url, error: error.message }); console.log(file, error.message); }
}
await writeFile(new URL('manifest.json', root), JSON.stringify(manifest, null, 2));
