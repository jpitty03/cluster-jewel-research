import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = new URL('../docs/poe2-crafting-engine/references/requests/morbid-siege/', import.meta.url);
const assigned = async file => { const text = await readFile(new URL(`market/${file}`,root),'utf8'); return JSON.parse(text.slice(text.indexOf('=')+1).trim().replace(/;$/,'')); };
const data = await assigned('coe-data.js');
const lang = await assigned('coe-english.js');
const allPrices = [];
for (const file of ['currency','ritual','abyss','essences','runes']) {
  const snapshot = JSON.parse(await readFile(new URL(`market/${file}.json`, root),'utf8'));
  assert.equal(snapshot.core.primary,'divine');
  allPrices.push(...snapshot.lines.map(row=>({id:row.id,divine:row.primaryValue,volumeDivine:row.volumePrimaryValue,sourceFile:`market/${file}.json`})));
}
const price = id => { const quote=allPrices.find(row=>row.id===id); assert.ok(quote && quote.divine>0,`Missing ${id}`); return quote.divine; };
const mods = new Map(data.mods.entries.map(row=>[row.id,row]));
const groups = new Map(data.modgroups.entries.map(row=>[row.id,row]));
const bow = Object.entries(data.classmods['57']).map(([id,weight])=>{
 const mod=mods.get(Number(id)); return {...mod,weight,name:lang[mod.label],groupData:groups.get(mod.group)};
});
const normal = bow.filter(row=>row.groupData.influence===6&&row.minlvl<=82&&row.maxlvl>=82);
const named = name => normal.find(row=>row.name===name);
const targetMods=['Gleaming','Shocking','Bloodthirsty','of the Sniper','of Splintering'].map(named);
assert.ok(targetMods.every(Boolean));
const targetGroups=targetMods.map(row=>row.group);
const minimumLevels=Object.fromEntries(targetMods.map(row=>[row.group,row.minlvl]));
const match = (row, group) => row.group===group && row.minlvl>=minimumLevels[group];
const share = (group, blockedGroups) => {
 const target=groups.get(group);
 const families=new Set(blockedGroups.flatMap(g=>groups.get(g).families));
 const pool=normal.filter(row=>row.groupData.type===target.type&&!row.groupData.families.some(f=>families.has(f)));
 const total=pool.reduce((s,row)=>s+row.weight,0),good=pool.filter(row=>match(row,group)).reduce((s,row)=>s+row.weight,0);
 return {good,total,p:good/total};
};
const finish=2*price('greater-iron-rune')+2*price('artificers');
const recovery=price('omen-of-light')+price('annul');
const occupiedFamilies=new Set(targetMods.flatMap(row=>row.groupData.families));
const desecrated=bow.filter(row=>row.groupData.influence===1000&&row.groupData.type===2&&row.minlvl<=82&&!row.groupData.families.some(f=>occupiedFamilies.has(f)));
const amanamu=desecrated.filter(row=>row.name==='of Amanamu');
assert.equal(desecrated.length,9); assert.equal(amanamu.length,3);
assert.ok(desecrated.every(row=>row.weight===1));
const counts=[0.8,0.15,0.05]; // Archived CoE GameEmulator.DESECRATION_MOD_SPAWN_RATE, not independently measured here.
const code=await readFile(new URL('market/coe-code.js',root),'utf8');
assert.ok(code.includes('DESECRATION_MOD_SPAWN_RATE=[.8,.15,.05]'),'Archived reveal model changed');
assert.equal(new Set(desecrated.map(row=>row.group)).size,9);
const plainP=counts.reduce((s,p,i)=>s+p*(i+1)/desecrated.length,0);
const liegeP=counts.reduce((s,p,i)=>s+p*(1/amanamu.length+(1-1/amanamu.length)*i/(desecrated.length-1)),0);
// Independent enumeration of forced first pick and remaining distinct special picks.
const target=desecrated.find(row=>row.key==='AbyssModBowSpearAmanamuSuffixCompanionAndLocalAttackSpeed');
assert.ok(target);
function enumerate(pool,picks,selected=[]) {
 if(picks===0)return selected.some(row=>row.id===target.id)?1:0;
 return pool.reduce((sum,row)=>sum+enumerate(pool.filter(other=>other.id!==row.id),picks-1,[...selected,row])/pool.length,0);
}
const enumeratedLiege=counts.reduce((sum,chance,i)=>sum+chance*amanamu.reduce((s,first)=>s+enumerate(desecrated.filter(row=>row.id!==first.id),i,[first])/amanamu.length,0),0);
assert.ok(Math.abs(enumeratedLiege-liegeP)<1e-12);
const finishPolicies=[];
for (const liege of [false,true]) for (const echoes of [false,true]) {
 const one=liege?liegeP:plainP;
 const p=echoes?1-(1-one)**2:one;
 const attempt=price('preserved-jawbone')+(liege?price('omen-of-the-liege'):0)+(echoes?price('omen-of-abyssal-echoes'):0);
 const expected=(attempt+(1-p)*recovery)/p+finish;
 const attempts95=Math.ceil(Math.log(0.05)/Math.log1p(-p));
 finishPolicies.push({liege,echoes,oneRevealSuccess:one,successPerAttempt:p,attemptDivine:attempt,recoveryDivine:recovery,finishDivine:finish,
   expectedAdditionalDivine:expected,maximumBaseToBeat75:75-expected,attemptsFor95Percent:attempts95,
   reserveFor95Percent:attempts95*attempt+(attempts95-1)*recovery+finish});
}
finishPolicies.sort((a,b)=>a.expectedAdditionalDivine-b.expectedAdditionalDivine);
const bestFinish=finishPolicies[0];
const [physical,lightning,percent,sniper,arrows]=targetGroups;
const routes=[];
for (const [anchor,guaranteed,essence] of [[physical,lightning,'greater-essence-of-electricity'],[percent,lightning,'greater-essence-of-electricity'],[lightning,physical,'greater-essence-of-abrasion'],[percent,physical,'greater-essence-of-abrasion']]) {
 const missing=[physical,lightning,percent].find(g=>g!==anchor&&g!==guaranteed);
 for (const order of [[missing,arrows],[arrows,missing]]) {
   const first=share(order[0],[anchor,guaranteed,sniper]);
   const second=share(order[1],[anchor,guaranteed,sniper,order[0]]);
   const c1=price('exalted')+price(groups.get(order[0]).type===1?'omen-of-sinistral-exaltation':'omen-of-dextral-exaltation');
   const c2=price('exalted')+price(groups.get(order[1]).type===1?'omen-of-sinistral-exaltation':'omen-of-dextral-exaltation');
   const success=first.p*second.p;
   const overhead=(price(essence)+c1+first.p*c2)/success+bestFinish.expectedAdditionalDivine;
   routes.push({anchorGroup:anchor,guaranteedGroup:guaranteed,essence,order,first,second,success,
     expectedTotalFormula:`${1/success} * magicBasePrice + ${overhead}`,
     costEvenWithFreeMagicBase:overhead,maximumMagicBaseToBeat75:(75-overhead)*success,
     scope:'Ordinary side-targeted Exalts; discard on any miss, no salvage. Not an optimized recovery policy.'});
 }
}
const result={game:'poe2',league:'Forbidden Rites',evaluatedAt:new Date().toISOString(),model:'Craft of Exile beta 0.5.5.1.5 (file directory 4.5.5.1.5)',
  priceUnit:'divine',assumptions:['PC softcore economy','Same-or-better tiers, any rolls','CoE inferred weights and reveal kernel, not an in-game guarantee','Five-mod finishing base has three correct prefixes, +4 skills, acceptable arrow suffix, no desecration','Failed reveal can be selected and removed using Light+Annul, restoring same state','Echoes modeled as independent second offer set; full cost charged each attempt'],
  targetCanonicalKeys:targetMods.map(row=>({key:row.key,group:row.group,minimumLevel:row.minlvl,accepted:normal.filter(m=>match(m,row.group)).map(m=>m.key)})),
  finishPolicies,ordinaryExaltRestartBaselines:routes.sort((a,b)=>a.costEvenWithFreeMagicBase-b.costEvenWithFreeMagicBase),
  limitations:['Trade API returned HTTP 403; no live intermediate availability or asking price verified','General multi-step recovery, fracture and special-mechanic policies not globally optimized','Market prices are exchange estimates, low-volume Liege quote may not fill at displayed ratio']};
await writeFile(new URL('calculated-routes.json',root),JSON.stringify(result,null,2));
await writeFile(new URL('prices.json',root),JSON.stringify({game:'poe2',league:'Forbidden Rites',priceUnit:'divine',fetchedAt:new Date().toISOString(),sourceManifest:'market/manifest.json',prices:allPrices},null,2));
console.log(JSON.stringify({finishPolicies,baselines:result.ordinaryExaltRestartBaselines.slice(0,3),targets:result.targetCanonicalKeys},null,2));
