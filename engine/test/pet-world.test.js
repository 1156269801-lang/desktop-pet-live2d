/**
 * 小世界进度层测试：金币、道具、需求衰减、小游戏结算。
 * 运行：node engine/test/pet-world.test.js
 */
'use strict'

const assert = require('node:assert/strict')
const {
  createWorld, sanitize, defaultWorld, ITEMS, GAMES, NEED_FLOOR,
} = require('../../electron/pet-world')

let passed = 0
function test(name, fn) {
  fn()
  passed += 1
  console.log('ok -', name)
}

/** 可控时钟 */
function clock(start = 1_700_000_000_000) {
  let t = start
  return { now: () => t, advance: (ms) => { t += ms; return t } }
}

test('默认世界合法且能直接进快照', () => {
  const c = clock()
  const world = createWorld({ now: c.now })
  const snap = world.snapshot()
  assert.equal(snap.coins, 20)
  assert.deepEqual(Object.keys(snap.needs).sort(), ['energy', 'mood', 'satiety'])
  for (const key of Object.keys(snap.needs)) {
    const v = snap.needs[key]
    assert.ok(v > 0 && v <= 100, key + ' ' + v)
  }
  assert.equal(world.moodTier(), 'fine', '默认三项均值 73，属于「还行」')
})

test('脏存档被清洗，能救的字段保留', () => {
  const c = clock()
  const world = createWorld({
    now: c.now,
    saved: {
      coins: -50,
      inventory: { fish: 2.7, 不存在的道具: 9, milktea: -3 },
      needs: { satiety: 999, mood: -20, energy: 'abc' },
      owned: ['ribbon', 'ribbon', 'ghost'],
      stats: { gamesPlayed: -1, bestScores: { bubble: 20000, 假游戏: 10 } },
      timers: { decayAt: 'x', lastFedAt: -1 },
    },
  })
  const snap = world.snapshot()
  assert.equal(snap.coins, 0)
  assert.deepEqual(snap.inventory, { fish: 2 })
  assert.equal(snap.needs.satiety, 100)
  assert.equal(snap.needs.mood, NEED_FLOOR.mood)
  assert.ok(Number.isFinite(snap.needs.energy))
  assert.deepEqual(snap.owned, ['ribbon'])
  assert.equal(snap.stats.gamesPlayed, 0)
  assert.equal(snap.stats.bestScores.bubble, 9999)
  assert.equal(Object.hasOwn(snap.stats.bestScores, '假游戏'), false)
})

test('买道具：够钱、不够钱、装扮不能重复买', () => {
  const c = clock()
  const world = createWorld({ now: c.now, saved: { coins: 10 } })
  assert.deepEqual(world.buy('不存在'), { ok: false, code: 'ITEM_UNKNOWN' })

  const ok = world.buy('fish')
  assert.equal(ok.ok, true)
  assert.equal(world.snapshot().coins, 5)
  assert.equal(world.snapshot().inventory.fish, 3)

  const poor = world.buy('mat')
  assert.equal(poor.ok, false)
  assert.equal(poor.code, 'NOT_ENOUGH_COINS')
  assert.equal(poor.short, 15)

  const world2 = createWorld({ now: c.now, saved: { coins: 100 } })
  assert.equal(world2.buy('ribbon').ok, true)
  assert.deepEqual(world2.buy('ribbon'), { ok: false, code: 'ALREADY_OWNED' })
})

test('用道具：扣库存、加需求、封顶不溢出', () => {
  const c = clock()
  const world = createWorld({ now: c.now, saved: { inventory: { fish: 2 }, needs: { satiety: 90, mood: 50, energy: 50 } } })
  const result = world.use('fish')
  assert.equal(result.ok, true)
  assert.equal(world.snapshot().inventory.fish, 1)
  assert.equal(world.snapshot().needs.satiety, 100, '小鱼干 +28 但封顶 100')
  assert.equal(world.snapshot().needs.mood, 54)

  world.use('fish')
  assert.deepEqual(world.use('fish'), { ok: false, code: 'EMPTY' })
  assert.equal(Object.hasOwn(world.snapshot().inventory, 'fish'), false)
})

test('装扮类道具不能当消耗品用', () => {
  const c = clock()
  const world = createWorld({ now: c.now, saved: { coins: 100 } })
  world.buy('ribbon')
  assert.deepEqual(world.use('ribbon'), { ok: false, code: 'PASSIVE_ITEM' })
})

test('一小时衰减符合 12 / 15 / 10 分钟的节奏', () => {
  const c = clock()
  const world = createWorld({ now: c.now, saved: { needs: { satiety: 60, mood: 60, energy: 60 } } })
  c.advance(60 * 60e3)
  const drops = world.tick()
  assert.equal(drops.satiety, 5, '12 分钟 1 点 → 1 小时 5 点')
  assert.equal(drops.mood, 4, '15 分钟 1 点 → 1 小时 4 点')
  assert.equal(drops.energy, 6, '10 分钟 1 点 → 1 小时 6 点')
  assert.equal(world.snapshot().needs.satiety, 55)
})

test('离线掉落有 6 小时封顶，回来不会看到饿死的宠物', () => {
  const c = clock()
  const world = createWorld({ now: c.now, saved: { needs: { satiety: 60, mood: 60, energy: 60 } } })
  c.advance(30 * 24 * 3600e3) // 离线整整一个月
  world.tick()
  const once = world.snapshot().needs
  // 6 小时封顶：12 分钟 1 点 → 最多掉 30 点
  assert.equal(once.satiety, 30)
  assert.equal(once.mood, 36, '15 分钟 1 点 → 6 小时 24 点')
  assert.equal(once.energy, 24, '10 分钟 1 点 → 6 小时 36 点')
  for (const key of Object.keys(once)) assert.ok(once[key] >= NEED_FLOOR[key], key)

  // 再离线一个月，掉的量还是一样（封顶是每次结算的，不是累计一次的）
  c.advance(30 * 24 * 3600e3)
  world.tick()
  assert.equal(world.snapshot().needs.satiety, 0 + NEED_FLOOR.satiety, '第二个月到底就该停在地板')
})

test('持续上线会一路掉到地板并停住，不会变负数', () => {
  const c = clock()
  const world = createWorld({ now: c.now, saved: { needs: { satiety: 60, mood: 60, energy: 60 } } })
  for (let i = 0; i < 24 * 7; i += 1) { // 一周，每小时结算一次
    c.advance(3600e3)
    world.tick()
  }
  const snap = world.snapshot().needs
  for (const key of Object.keys(snap)) {
    assert.equal(snap[key], NEED_FLOOR[key], key)
  }
})

test('高频 tick 不能把衰减时间线刷新掉', () => {
  const c = clock()
  const world = createWorld({ now: c.now, saved: { needs: { satiety: 80, mood: 80, energy: 80 } } })
  for (let i = 0; i < 12000; i += 1) { // 60ms × 12000 = 12 分钟
    c.advance(60)
    world.tick()
  }
  assert.equal(world.snapshot().needs.satiety, 79)
})

test('小游戏结算：正常收益、低分不给、体力不足收益减半', () => {
  const c = clock()
  const world = createWorld({ now: c.now, saved: { coins: 0, needs: { satiety: 80, mood: 80, energy: 80 } } })
  const normal = world.settleGame('bubble', 30)
  assert.equal(normal.ok, true)
  assert.equal(normal.coins, 10, '30 × 0.34 ≈ 10')
  assert.equal(normal.best, 30)
  assert.equal(world.snapshot().needs.energy, 74)

  const low = world.settleGame('bubble', 2)
  assert.equal(low.coins, 0, '低于 minScoreToReward 不给钱')

  // 把体力耗到不足
  const tired = createWorld({ now: c.now, saved: { coins: 0, needs: { satiety: 80, mood: 80, energy: 4 } } })
  const result = tired.settleGame('bubble', 30)
  assert.equal(result.tired, true)
  assert.equal(result.coins, 5, '减半')

  assert.deepEqual(world.settleGame('不存在', 10), { ok: false, code: 'GAME_UNKNOWN' })
})

test('小游戏分数被夹紧，不会负收益', () => {
  const c = clock()
  const world = createWorld({ now: c.now, saved: { coins: 10, needs: { satiety: 80, mood: 80, energy: 80 } } })
  assert.equal(world.settleGame('bubble', -999).coins, 0)
  assert.equal(world.settleGame('bubble', Number.NaN).score, 0)
  const huge = world.settleGame('bubble', 1e9)
  assert.ok(huge.score <= 9999)
  assert.ok(world.snapshot().coins > 0)
})

test('摸头有冷却', () => {
  const c = clock()
  const world = createWorld({ now: c.now })
  const first = world.pet()
  assert.equal(first.ok, true)
  assert.deepEqual(world.pet(), { ok: false, code: 'COOLDOWN' })
  c.advance(5000)
  assert.equal(world.pet().ok, true)
})

test('快照是隔离副本，改它不影响内部状态', () => {
  const c = clock()
  const world = createWorld({ now: c.now })
  const snap = world.snapshot()
  snap.coins = 999999
  snap.needs.satiety = 0
  snap.inventory.fish = 999
  assert.equal(world.snapshot().coins, 20)
  assert.notEqual(world.snapshot().needs.satiety, 0)
  assert.notEqual(world.snapshot().inventory.fish, 999)
})

test('默认世界与道具表自洽', () => {
  const base = defaultWorld()
  assert.ok(base.coins > 0)
  for (const [id, item] of Object.entries(ITEMS)) {
    assert.equal(item.id, id)
    assert.ok(item.price > 0, id)
    assert.ok(Object.keys(item.effect).length > 0, id)
  }
  for (const [id, game] of Object.entries(GAMES)) {
    assert.equal(game.id, id)
    assert.ok(game.coinsPerScore > 0, id)
  }
  assert.deepEqual(sanitize(null), sanitize(undefined))
})

console.log('\n' + passed + ' passed')
