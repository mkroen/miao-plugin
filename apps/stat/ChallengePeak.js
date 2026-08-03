import lodash from 'lodash'
import { Cfg, Common, Data } from '#miao'
import { MysApi, Player } from '#miao.models'

const rankIcons = [
  'ChallengePeakRankIconTypeNone',
  'ChallengePeakRankIconTypeBronze',
  'ChallengePeakRankIconTypeGold',
  'ChallengePeakRankIconTypeSilver',
  'ChallengePeakRankIconTypeUltra'
]

export async function ChallengePeak (e) {
  if (!Cfg.get('challengePeak', false)) {
    return false
  }

  const rawMsg = e.original_msg || e.msg || ''
  const type = /上期/.test(rawMsg) ? 2 : 1
  const periodText = type === 2 ? '上期' : '本期'
  const mys = await MysApi.init(e, 'all')
  if (!mys || !mys.uid) {
    e.reply(`请绑定ck后再使用${rawMsg}`)
    return true
  }

  let resRole
  let resDetail
  try {
    resRole = await mys.getChallengePeak(type)
    const hasRecord = Data.getVal(resRole, 'challenge_peak_records.0.has_challenge_record')
    if (!hasRecord) {
      e.reply(`暂未获得${periodText}异相仲裁数据...`)
      return true
    }
    resDetail = await mys.getCharacter()
  } catch (err) {
    logger.error('[miao-plugin][ChallengePeak] 异相仲裁数据获取失败', err)
    e.reply('异相仲裁数据获取失败，请稍后再试')
    return true
  }

  const record = resRole?.challenge_peak_records?.[0]
  if (!record || !Array.isArray(resDetail?.avatar_list)) {
    e.reply('异相仲裁角色信息获取失败')
    return true
  }

  const player = Player.create(e, 'sr')
  player.setMysCharData(resDetail)

  const avatarIds = []
  const addAvatar = (avatar) => {
    if (avatar?.id && !avatarIds.includes(avatar.id)) {
      avatarIds.push(avatar.id)
    }
  }
  lodash.forEach(record.mob_records, records => {
    lodash.forEach(records?.avatars, addAvatar)
  })
  lodash.forEach(record.boss_record?.avatars, addAvatar)

  try {
    await player.refreshTalent(avatarIds)
  } catch {
    logger.warn('[miao-plugin][ChallengePeak] 角色天赋信息刷新失败，使用已有角色数据')
  }
  const avatars = player.getAvatarData(avatarIds)
  if (avatarIds.some(id => !avatars[id])) {
    e.reply('异相仲裁角色信息获取失败')
    return true
  }

  const rankIconType = resRole?.challenge_peak_best_record_brief?.challenge_peak_rank_icon_type
  const rankIcon = Math.max(0, rankIcons.indexOf(rankIconType))
  delete resRole._res
  delete resDetail._res

  return await Common.render('stat/challenge-peak', {
    ...resRole,
    challenge_peak_records: record,
    save_id: mys.uid,
    uid: mys.uid,
    type,
    rank_icon: rankIcon,
    avatars,
    Array: (num) => Number.isInteger(Number(num)) && Number(num) > 0 ? Array(Math.min(Number(num), 20)) : [],
    timeCalc: (time) => time?.year ? `${time.year}.${time.month}.${time.day}` : '-'
  }, { e, scale: 1.4 })
}
