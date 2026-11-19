'use strict'
// 「小世界」——桌宠第二形态的进度层。
// 只管金币、道具、三项需求和小游戏结算，是纯逻辑：
// 不碰 Electron、不碰文件系统、不碰网络。读写与广播都由 main.js 注入。
//
// 设计取向：陪伴向，不是养成惩罚向。
// 需求有地板值，离线掉落有封顶，饿着了会闹脾气但永远不会死。

const SCHEMA_VERSION = 1

const NEED_KEYS = Object.freeze(['satiety', 'mood', 'energy'])
const NEED_MAX = 100
// 每点需求掉落所需的毫秒数
const DECAY_MS = Object.freeze({ satiety: 12 * 60e3, mood: 15 * 60e3, energy: 10 * 60e3 })
// 离线超过这么久就不再继续算掉落，回来不会看到一个饿死的宠物
const OFFLINE_CAP_MS = 6 * 3600e3
// 地板值：到底就停在这儿，不会归零。
// energy 的地板必须低于所有小游戏的 energyCost，否则"体力不足收益减半"
// 这条永远触发不了 —— 宠物会一直被判定为"还有体力"。
const NEED_FLOOR = Object.freeze({ satiety: 5, mood: 10, energy: 2 })
const STARTING_COINS = 20
const MAX_COINS = 999999
const MAX_SCORE = 9999

const ITEMS = Object.freeze({
  fish: Object.freeze({
    id: 'fish', name: '小鱼干', price: 5, kind: 'food',
    effect: Object.freeze({ satiety: 28, mood: 4 }),
    desc: '最便宜也最管用，一口一条。',
  }),
  milktea: Object.freeze({
    id: 'milktea', name: '珍珠奶茶', price: 12, kind: 'food',
    effect: Object.freeze({ satiety: 10, energy: 22, mood: 6 }),
    desc: '熬夜也要喝，喝完更精神。',
  }),
  yarn: Object.freeze({
    id: 'yarn', name: '毛线球', price: 8, kind: 'toy',
    effect: Object.freeze({ mood: 22, energy: -6 }),
    desc: '滚起来就停不下，玩完会累。',
  }),
  mat: Object.freeze({
    id: 'mat', name: '午睡垫', price: 20, kind: 'rest',
    effect: Object.freeze({ energy: 45, mood: 4 }),
    desc: '趴上去就不想起来。',
  }),
  ribbon: Object.freeze({
    id: 'ribbon', name: '蝴蝶结', price: 30, kind: 'deco',
    effect: Object.freeze({ mood: 10 }),
    desc: '戴上以后会自己照镜子。',
    unique: true,
  }),
})

// 小游戏：分数由渲染层的玩法算出，这里只负责结算，避免两套经济系统。
const GAMES = Object.freeze({
  bubble: Object.freeze({
    id: 'bubble', name: '戳泡泡', energyCost: 6,
    coinsPerScore: 0.34, minScoreToReward: 3,
    desc: '泡泡冒出来就戳，连戳有加成。',
  }),
  catchcoin: Object.freeze({
    id: 'catchcoin', name: '接金币', energyCost: 9,
    coinsPerScore: 0.5, minScoreToReward: 2,
    desc: '左右挪来回接，掉地上不算。',
  }),
})

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v)
const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v))
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}
const clampNeed = (key, v) => Math.min(NEED_MAX, Math.max(NEED_FLOOR[key], Math.round(Number(v) || 0)))

function defaultWorld(now = Date.now()) {
  return {
    schemaVersion: SCHEMA_VERSION,
    coins: STARTING_COINS,
    inventory: { fish: 2 },
    needs: { satiety: 68, mood: 72, energy: 80 },
    owned: [],
    stats: { gamesPlayed: 0, coinsEarned: 0, coinsSpent: 0, bestScores: {} },
    // 三项需求各自的掉落计时器：共用一条时间线的话，周期不同的三个值
    // 会互相把余量冲掉（satiety 攒到 12 分钟就把 mood 的 14 分钟清零）。
    timers: {
      at: { satiety: now, mood: now, energy: now },
      lastFedAt: 0, lastPlayedAt: 0, lastPetAt: 0,
    },
  }
}

/**
 * 读存档：任何一项不可信就回退到默认值，绝不把脏数据往运行时带。
 * 老存档没有这块时返回全新世界；有但残缺时尽量保住能救的字段。
 */
function sanitize(raw, now = Date.now()) {
  const base = defaultWorld(now)
  if (!isObj(raw)) return base
  const out = base

  out.coins = clampInt(raw.coins, 0, MAX_COINS, base.coins)

  if (isObj(raw.inventory)) {
    const inv = {}
    for (const [id, count] of Object.entries(raw.inventory)) {
      if (!Object.hasOwn(ITEMS, id)) continue
      // 库存是"件"，2.7 条鱼只能算 2 条，不能四舍五入凭空多出来
      const n = Math.floor(Number(count))
      if (!Number.isFinite(n) || n <= 0) continue
      inv[id] = Math.min(999, n)
    }
    out.inventory = inv
  }

  if (isObj(raw.needs)) {
    for (const key of NEED_KEYS) out.needs[key] = clampNeed(key, raw.needs[key])
  }

  if (Array.isArray(raw.owned)) {
    out.owned = [...new Set(raw.owned.filter((id) => Object.hasOwn(ITEMS, id)))]
  }

  if (isObj(raw.stats)) {
    out.stats.gamesPlayed = clampInt(raw.stats.gamesPlayed, 0, MAX_COINS, 0)
    out.stats.coinsEarned = clampInt(raw.stats.coinsEarned, 0, MAX_COINS, 0)
    out.stats.coinsSpent = clampInt(raw.stats.coinsSpent, 0, MAX_COINS, 0)
    if (isObj(raw.stats.bestScores)) {
      for (const id of Object.keys(GAMES)) {
        const score = clampInt(raw.stats.bestScores[id], 0, MAX_SCORE, 0)
        if (score > 0) out.stats.bestScores[id] = score
      }
    }
  }

  if (isObj(raw.timers)) {
    const at = isObj(raw.timers.at) ? raw.timers.at : null
    for (const key of NEED_KEYS) {
      const value = Number(at ? at[key] : Number.NaN)
      out.timers.at[key] = Number.isFinite(value) && value >= 0 ? Math.min(value, now) : now
    }
    for (const key of ['lastFedAt', 'lastPlayedAt', 'lastPetAt']) {
      const t = Number(raw.timers[key])
      if (Number.isFinite(t) && t >= 0) out.timers[key] = Math.min(t, now)
    }
  }
  return out
}

function createWorld({ saved = null, now = Date.now } = {}) {
  let state = sanitize(saved, now())

  function clock() {
    const t = now()
    return Number.isFinite(t) && t >= 0 ? t : 0
  }

  /** 按真实时间补掉落，离线部分封顶。返回变化量，便于主进程决定要不要提示。 */
  function tick() {
    const t = clock()
    const drops = {}
    for (const key of NEED_KEYS) {
      const last = Number.isFinite(state.timers.at[key]) ? state.timers.at[key] : t
      const elapsed = Math.min(Math.max(0, t - last), OFFLINE_CAP_MS)
      const points = Math.floor(elapsed / DECAY_MS[key])
      if (points <= 0) continue
      const before = state.needs[key]
      const after = clampNeed(key, before - points)
      if (after !== before) {
        state.needs[key] = after
        drops[key] = before - after
      }
      // 只把已经"结算掉"的时间推进过去；不足一个整点的余量留着下次用。
      state.timers.at[key] = t
    }
    return drops
  }

  function applyEffect(effect, scale = 1) {
    for (const [key, delta] of Object.entries(effect)) {
      if (!NEED_KEYS.includes(key)) continue
      state.needs[key] = clampNeed(key, state.needs[key] + Math.round(delta * scale))
    }
  }

  /** 买。金币不够 / 装扮已拥有 都返回明确原因。 */
  function buy(itemId) {
    const item = Object.hasOwn(ITEMS, itemId) ? ITEMS[itemId] : null
    if (!item) return { ok: false, code: 'ITEM_UNKNOWN' }
    if (item.unique && state.owned.includes(item.id)) return { ok: false, code: 'ALREADY_OWNED' }
    if (state.coins < item.price) return { ok: false, code: 'NOT_ENOUGH_COINS', short: item.price - state.coins }
    state.coins -= item.price
    state.stats.coinsSpent += item.price
    if (item.unique) state.owned.push(item.id)
    else state.inventory[item.id] = clampInt((state.inventory[item.id] || 0) + 1, 0, 999, 1)
    return { ok: true, item: { id: item.id, name: item.name }, coins: state.coins }
  }

  /** 用一件。没货就明说；装扮类买了就算穿上，不进背包。 */
  function use(itemId) {
    const item = Object.hasOwn(ITEMS, itemId) ? ITEMS[itemId] : null
    if (!item) return { ok: false, code: 'ITEM_UNKNOWN' }
    if (item.unique) return { ok: false, code: 'PASSIVE_ITEM' }
    if ((state.inventory[item.id] || 0) < 1) return { ok: false, code: 'EMPTY' }
    state.inventory[item.id] -= 1
    if (state.inventory[item.id] <= 0) delete state.inventory[item.id]
    applyEffect(item.effect)
    const t = clock()
    if (item.kind === 'food') state.timers.lastFedAt = t
    else state.timers.lastPlayedAt = t
    return { ok: true, item: { id: item.id, name: item.name }, needs: { ...state.needs } }
  }

  /**
   * 小游戏结算。
   * 体力不足时收益减半而不是禁止玩——禁止会让人立刻关掉这个功能。
   */
  function settleGame(gameId, score) {
    const game = Object.hasOwn(GAMES, gameId) ? GAMES[gameId] : null
    if (!game) return { ok: false, code: 'GAME_UNKNOWN' }
    const safeScore = clampInt(score, 0, MAX_SCORE, 0)
    const tired = state.needs.energy < game.energyCost
    state.needs.energy = clampNeed('energy', state.needs.energy - game.energyCost)
    const t = clock()
    state.timers.lastPlayedAt = t
    state.stats.gamesPlayed += 1
    if (safeScore > (state.stats.bestScores[game.id] || 0)) state.stats.bestScores[game.id] = safeScore
    if (safeScore < game.minScoreToReward) {
      return { ok: true, coins: 0, score: safeScore, tired, best: state.stats.bestScores[game.id], needs: { ...state.needs } }
    }
    const raw = safeScore * game.coinsPerScore * (tired ? 0.5 : 1)
    const coins = Math.max(1, Math.round(raw))
    const before = state.coins
    state.coins = clampInt(state.coins + coins, 0, MAX_COINS, before)
    const gained = state.coins - before
    state.stats.coinsEarned += gained
    return { ok: true, coins: gained, score: safeScore, tired, best: state.stats.bestScores[game.id], needs: { ...state.needs } }
  }

  /** 摸头。冷却内的重复点击不加心情，避免连点刷满。 */
  function pet() {
    const t = clock()
    if (t - state.timers.lastPetAt < 4000) return { ok: false, code: 'COOLDOWN' }
    state.timers.lastPetAt = t
    applyEffect({ mood: 3 })
    return { ok: true, needs: { ...state.needs } }
  }

  function snapshot() {
    return {
      coins: state.coins,
      needs: { ...state.needs },
      inventory: { ...state.inventory },
      owned: [...state.owned],
      stats: { ...state.stats, bestScores: { ...state.stats.bestScores } },
    }
  }

  /** 心情档位，给渲染层挑表情用 */
  function moodTier() {
    const avg = (state.needs.satiety + state.needs.mood + state.needs.energy) / 3
    if (avg >= 78) return 'great'
    if (avg >= 55) return 'fine'
    if (avg >= 32) return 'low'
    return 'poor'
  }

  return Object.freeze({
    tick,
    buy,
    use,
    settleGame,
    pet,
    snapshot,
    moodTier,
    get state() { return state },
  })
}

module.exports = {
  createWorld, sanitize, defaultWorld,
  ITEMS, GAMES, NEED_KEYS, NEED_MAX, NEED_FLOOR, SCHEMA_VERSION,
}
