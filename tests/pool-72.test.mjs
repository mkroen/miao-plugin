import assert from 'node:assert/strict'
import fs from 'node:fs'
import { poolDetail } from '../resources/meta-gs/info/pool.js'
import { details, buffs } from '../resources/meta-gs/character/米提亚/calc.js'
import weapons from '../resources/meta-gs/weapon/catalyst/calc.js'
const pool = poolDetail.find(p => p.version === '7.2' && p.half === '上半')
assert.equal(pool.to, '2026-11-24 17:59:59')
const source = fs.readFileSync(new URL('../models/HardChallenge.js', import.meta.url), 'utf8')
const expression = source.match(/let pool = (poolDetail.find[^\n]+)/)[1]
const select = new Function('poolDetail', 'scheduleTime', 'return ' + expression)
for (const [date, expected] of [['2026-11-04 06:00:00', true], ['2026-11-24 17:59:59', true], ['2026-11-24 18:00:00', false], ['2027-01-01 00:00:00', false]]) {
  assert.equal(select(poolDetail, new Date(date).getTime()) === pool, expected)
}
const data = JSON.parse(fs.readFileSync(new URL('../resources/meta-gs/character/米提亚/data.json', import.meta.url)))
function findTalent(obj) {
  if (obj?.a?.['递变聚爆星超导伤害'] && obj?.e?.['稳态炉心引爆伤害']) return obj
  for (const value of Object.values(obj || {})) if (value && typeof value === 'object') { const found = findTalent(value); if (found) return found }
}
const raw = findTalent(data)
assert.ok(raw)
const talent = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Object.fromEntries(Object.entries(value).map(([name, levels]) => [name, levels[0]]))]))
for (const mastery of [0, 500, 1000]) {
  for (const detail of details) {
    const result = detail.dmg({ attr: { mastery, atk: 1000 }, calc: x => x, talent }, { basic: n => n })
    assert.ok(Number.isFinite(result), detail.title)
    assert.ok(result >= 0)
  }
}
assert.equal(buffs[0].data.mastery({cons: 0}), 120)
assert.equal(buffs[0].data.mastery({cons: 1}), 150)
assert.equal(buffs[2].data.fypct({attr: {mastery: 1000}, calc: x => x}), 14)
const weapon = weapons(x => x, (key, value) => ({[key]: value}))['秘星典谕']
assert.equal(weapon[1].refine.mastery, 120)
assert.equal(weapon[2].check({params: {}}), false)
assert.equal(weapon[2].check({params: {Starsealed_Edict: true}}), true)
console.log('PASS: banner dates, consumer boundaries, seven damage entries, buffs and weapon conditions')
