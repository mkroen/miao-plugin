// 玉璃中文版与网站 /gi/theater 使用同一期数索引；不要用数组顺序推算月份。
const base = 'https://json.alioth.wiki/data/gi/ch/'
const acts = { 3: '第三幕', 6: '第六幕', 8: '第八幕', 10: '第十幕', 11: '圣牌挑战 I', 12: '圣牌挑战 II' }

export async function loadAliothTheater (message, request) {
  const read = async path => {
    const response = await request(base + path, { timeout: 12000 })
    if (!response.ok) throw new Error(`玉璃 ${path}: HTTP ${response.status}`)
    return response.json()
  }
  const index = await read('theater.json')
  const phases = index.Phases.filter(p => /^\d{4}\/\d{2}$/.test(p.Time) && Number.isInteger(p._id))
  if (!phases.length) throw new Error('玉璃剧诗索引为空')
  const month = message.match(/\d{6}/)?.[0]
  const phase = phases.find(p => p.Time.replace('/', '') === month)
  if (!phase) {
    const dates = phases.map(p => p.Time).sort()
    return { error: `玉璃未收录该月份的剧诗。目前收录范围：${dates[0]} 至 ${dates.at(-1)}。` }
  }
  const data = phase._id === index.Latest?._id ? index.Latest : await read(`theater/${phase._id}.json`)
  if (data?._id !== phase._id || ![data.Initial, data.Invitation, data.Elem].every(Array.isArray)) throw new Error('玉璃剧诗详情格式异常')
  const monsters = (await read('monster.json')).Templates
  if (!monsters) throw new Error('玉璃怪物索引为空')
  const info = (data.Chambers || []).filter(c => acts[c._id]).map(c => {
    const ids = data.MP?.[c.Configs?.[0]] || []
    const names = ids.map(id => String(monsters[id]?.Name || `怪物 ${id}`).replace(/<[^>]*>/g, ''))
    return names.length ? `${acts[c._id]}：${names.join('、')}${c.Time ? `（${c.Time}）` : ''}` : ''
  }).filter(Boolean).join('\n')
  return { data, info }
}
