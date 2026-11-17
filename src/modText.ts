// Since the Covens league poe.ninja's mod lines carry the game's keyword markup:
// "1 Added Passive Skill is [affliction_notable_overshock|Overshock]". Reduce
// "[id|Text]" and "[Text]" to the text the game shows, so names match earlier leagues
// and the trade site's stat list.
export const plainModText = (line: string): string =>
  line.replace(/\[(?:[^\]|]*\|)?([^\]]*)\]/g, '$1')
