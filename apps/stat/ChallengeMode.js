import lodash from 'lodash'
import { Cfg, Common } from '#miao'
import { MysApi, Player } from '#miao.models'

const modes = {
  chaos: {
    key: 'chaos',
    cfg: 'challengeChaos',
    title: '混沌回忆',
    api: 'getChallenge',
    floorLimit: 3
  },
  story: {
    key: 'story',
    cfg: 'challengeStory',
    title: '虚构叙事',
    api: 'getChallengeStory'
  },
  boss: {
    key: 'boss',
    cfg: 'challengeBoss',
    title: '末日幻影',
    api: 'getChallengeBoss'
  }
}

function getChallengeMode (rawMsg) {
  if (/混沌|忘却/.test(rawMsg)) {
    return modes.chaos
  }
  return /虚构/.test(rawMsg) ? modes.story : modes.boss
}

function getPeriodGroup (groups, floors, type) {
  const scheduleId = Math.floor(Number(floors?.[0]?.maze_id || 0) / 10)
  return groups?.find(group => Number(group.schedule_id) === scheduleId) || groups?.[type - 1] || groups?.[0] || {}
}

function getFloorStarData (floor) {
  const starNum = Math.max(Number(floor?.star_num || 0), 0)
  const baseStarNum = Math.min(starNum, 3)
  const extraStarLimit = floor?.is_tierce
    ? Math.max(Number(floor?.extra_star_num || 0), 0)
    : 0
  return {
    starNum,
    baseStarNum,
    extraStarNum: Math.min(Math.max(starNum - baseStarNum, 0), extraStarLimit)
  }
}

function getFloorData (floors, group) {
  const bossKeys = ['upper_boss', 'lower_boss', 'tierce_boss']
  const labels = ['节点1', '节点2', '节点3']
  return lodash.map(floors, floor => {
    const starData = getFloorStarData(floor)
    const nodes = [floor.node_1, floor.node_2, floor.node_3]
      .map((node, index) => {
        if (!node || (index === 2 && !floor.is_tierce)) {
          return false
        }
        const hasScore = node.score !== undefined && node.score !== null && node.score !== ''
        const scoreNum = Number(node.score || 0)
        const hasBattleData = Boolean(
          node.buff ||
          node.avatars?.length ||
          node.boss_defeated ||
          scoreNum > 0
        )
        if (!hasBattleData) {
          return false
        }
        return {
          ...node,
          label: labels[index],
          boss: group?.[bossKeys[index]] || null,
          hasScore,
          scoreNum
        }
      })
      .filter(Boolean)
    return {
      ...floor,
      ...starData,
      isQuickClear: starData.baseStarNum === 3 && nodes.length === 0,
      hasRoundNum: floor.round_num !== undefined && floor.round_num !== null,
      roundNum: Number(floor.round_num || 0),
      totalScore: lodash.sumBy(nodes, 'scoreNum'),
      primaryNode: nodes[0] || null,
      secondaryNodes: nodes.slice(1),
      nodes
    }
  })
}

function getDisplayFloors (floors, mode) {
  const detailed = floors.filter(floor => floor.nodes.length || floor.isQuickClear)
  if (!mode.floorLimit) {
    return detailed
  }
  return lodash.orderBy(detailed, floor => Number(floor.maze_id || 0), 'desc').slice(0, mode.floorLimit)
}

function getChaosPeriodGroup (data) {
  return {
    begin_time: data?.begin_time,
    end_time: data?.end_time
  }
}

export async function ChallengeMode (e) {
  const rawMsg = e.original_msg || e.msg || ''
  const mode = getChallengeMode(rawMsg)
  if (!Cfg.get(mode.cfg, false)) {
    return false
  }

  const type = /上期/.test(rawMsg) ? 2 : 1
  const periodText = type === 2 ? '上期' : '本期'
  const mys = await MysApi.init(e, 'all')
  if (!mys || !mys.uid) {
    e.reply(`请绑定ck后再使用${rawMsg}`)
    return true
  }

  let data
  try {
    data = await mys[mode.api](type)
  } catch (err) {
    logger.error(`[miao-plugin][ChallengeMode] ${mode.title}数据获取失败`, err)
    e.reply(`${mode.title}数据获取失败，请稍后再试`)
    return true
  }

  const floors = data?.all_floor_detail
  if (!data?.has_data || !Array.isArray(floors) || floors.length === 0) {
    e.reply(`暂未获得${periodText}${mode.title}数据...`)
    return true
  }

  let characterData
  try {
    characterData = await mys.getCharacter()
  } catch (err) {
    logger.error(`[miao-plugin][ChallengeMode] ${mode.title}角色信息获取失败`, err)
    e.reply(`${mode.title}角色信息获取失败，请稍后再试`)
    return true
  }
  if (!Array.isArray(characterData?.avatar_list)) {
    e.reply(`${mode.title}角色信息获取失败`)
    return true
  }

  const group = mode.key === 'chaos'
    ? getChaosPeriodGroup(data)
    : getPeriodGroup(data.groups, floors, type)
  const floorData = getFloorData(floors, group)
  const displayFloors = getDisplayFloors(floorData, mode)
  const obtainedExtraStarNum = lodash.sumBy(floorData, 'extraStarNum')
  const player = Player.create(e, 'sr')
  player.setMysCharData(characterData)

  const avatarIds = []
  lodash.forEach(displayFloors, floor => {
    lodash.forEach(floor.nodes, node => {
      lodash.forEach(node.avatars, avatar => {
        if (!avatar?.id || avatarIds.includes(avatar.id)) {
          return
        }
        avatarIds.push(avatar.id)
        if (!player.hasAvatar(avatar.id)) {
          player.setAvatar({
            id: avatar.id,
            level: avatar.level,
            cons: avatar.rank,
            elem: avatar.element
          }, 'mys')
        }
      })
    })
  })

  try {
    await player.refreshTalent(avatarIds)
  } catch (err) {
    logger.warn(`[miao-plugin][ChallengeMode] ${mode.title}天赋信息刷新失败`, err)
  }
  const avatars = player.getAvatarData(avatarIds)
  lodash.forEach(displayFloors, floor => {
    lodash.forEach(floor.nodes, node => {
      node.avatarCards = lodash.map(node.avatars, battleAvatar => ({
        ...avatars[battleAvatar.id],
        level: battleAvatar.level ?? avatars[battleAvatar.id]?.level,
        cons: battleAvatar.rank ?? avatars[battleAvatar.id]?.cons,
        elem: battleAvatar.element || avatars[battleAvatar.id]?.elem
      }))
    })
  })
  delete data._res
  delete characterData._res

  return await Common.render('stat/challenge-mode', {
    ...data,
    uid: mys.uid,
    save_id: mys.uid,
    challengeMode: mode,
    mode: 'sr',
    type,
    periodText,
    group,
    floors: displayFloors,
    obtainedExtraStarNum,
    avatars,
    Array: (num) => Number.isInteger(Number(num)) && Number(num) > 0 ? Array(Math.min(Number(num), 20)) : [],
    timeCalc: (time) => time?.year
      ? `${time.year}.${String(time.month).padStart(2, '0')}.${String(time.day).padStart(2, '0')}`
      : '-',
    timeDetail: (time) => time?.year
      ? `${time.year}.${String(time.month).padStart(2, '0')}.${String(time.day).padStart(2, '0')} ${String(time.hour).padStart(2, '0')}:${String(time.minute).padStart(2, '0')}`
      : '-',
    numberFormat: (num) => Number(num || 0).toLocaleString('zh-CN')
  }, { e, scale: 1.4 })
}

export { getChallengeMode, getChaosPeriodGroup, getDisplayFloors, getFloorData, getFloorStarData, getPeriodGroup, modes }
