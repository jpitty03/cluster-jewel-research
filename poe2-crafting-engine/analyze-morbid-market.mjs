import { readFile } from 'node:fs/promises';
const root = new URL('../docs/poe2-crafting-engine/references/requests/morbid-siege/market/', import.meta.url);
const assigned = async file => { const text = await readFile(new URL(file, root), 'utf8'); return JSON.parse(text.slice(text.indexOf('=') + 1).trim().replace(/;$/, '')); };
const data = await assigned('coe-data.js');
const lang = await assigned('coe-english.js');
const prices = await assigned('coe-prices.js');
if (process.argv.includes('--pool')) {
 console.log('CLASS57', data.classes.entries.find(row => row.id === 57));
 console.log('GROUP', data.modgroups.entries.find(row => row.id === 704));
 for (const [id, weight] of Object.entries(data.classmods['57'])) {
   const mod = data.mods.entries.find(row => row.id === Number(id));
   const group = data.modgroups.entries.find(row => row.id === mod.group);
   if (/Sniper|Splintering|Amanamu/.test(lang[mod.label])) console.log(JSON.stringify({ mod, group, weight, name: lang[mod.label] }));
 }
 for (const file of ['ritual.json','abyss.json','essences.json','runes.json']) {
   const d = JSON.parse(await readFile(new URL(file,root),'utf8'));
   console.log(file,d.core.primary,d.lines.filter(row=>/light|echo|liege|jawbone|exaltation|erasure|annulment|abrasion|electricity|iron-rune/.test(row.id)).map(row=>({id:row.id,divine:row.primaryValue,volume:row.volumePrimaryValue})));
 }
 process.exit(0);
}
if (process.argv.includes('--details')) {
  console.log('BOWCLASS', data.classes.entries.filter(row => lang[row.label] === 'Bow'));
  console.log('BASE', data.items.entries.filter(row => row.label === 591));
  console.log('MODSAMPLE', data.mods.entries.slice(0, 2));
  console.log('SNIPER', data.mods.entries.filter(row => JSON.stringify(row).includes('4198')));
  console.log('CLASSSAMPLE', JSON.stringify(data.classmods['13']).slice(0, 2200));
  console.log('PRICENAMES', Object.entries(prices.leagueSoftcore).filter(([key]) => /OmenOnAbyss|OmenOnAnnulRemoveAbyss|OmenOnExalt|OmenOnChaosPrefix|RuneEnhanceGreater|Abyss/.test(key)));
  console.log('CRAFT', JSON.stringify(data.methods.crafting).slice(0,1800));
  const code = await readFile(new URL('coe-code.js', root), 'utf8');
  for (const term of ['DESECRATION_MOD_SPAWN_RATE=', 'OmenOnAbyssGuarenteeLichTypeMod2', 'reveal(', 'unveil(', 'OmenOnAbyssRerollOptions']) {
    let index = -1; let count = 0;
    while ((index = code.indexOf(term,index+1)) >= 0 && count++ < 5) console.log('CODE', term, index, code.slice(Math.max(0,index-200),index+2200));
  }
  process.exit(0);
}
console.log('KEYS', Object.keys(data));
for (const [key, value] of Object.entries(data)) console.log(key, Array.isArray(value) ? value.length : Object.keys(value).slice(0, 15));
console.log('PRICEKEYS', Object.keys(prices));
const currency = JSON.parse(await readFile(new URL('currency.json', root), 'utf8'));
console.log('CORE', currency.core);
console.log('PRICES', currency.lines.map(row => ({ id: row.id, value: row.primaryValue })));
for (const key of ['modifiers', 'bases', 'baseitems', 'methods', 'currencies']) {
 const value = data[key]; if (!value) continue;
 console.log('SAMPLE', key, JSON.stringify(value).slice(0, 2200));
}
const code = await readFile(new URL('coe-code.js', root), 'utf8');
for (const term of ['amanamu', 'liege', 'desecrat', 'abyssal', 'unveil']) {
 const idx = code.toLowerCase().indexOf(term); console.log('CODE', term, idx, code.slice(Math.max(0,idx-150), idx+1800));
}
console.log('LANG', lang.map((text, index) => ({text,index})).filter(row => /Sniper|Splintering|Obliterator|Amanamu/.test(row.text)));
