import { describe, expect, it } from 'vitest'
import { plainModText } from './modText'

describe('plainModText', () => {
  it('reduces keyword markup to the text the game shows', () => {
    expect(plainModText('1 Added Passive Skill is [affliction_notable_overshock|Overshock]')).toBe(
      '1 Added Passive Skill is Overshock',
    )
    expect(plainModText('12% increased [Lightning] Damage')).toBe('12% increased Lightning Damage')
  })

  it('leaves plain lines alone', () => {
    const line = 'Added Small Passive Skills also grant: +4 to Maximum Mana'
    expect(plainModText(line)).toBe(line)
  })
})
