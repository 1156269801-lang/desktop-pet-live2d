'use strict'

// B2: deterministic intent gate + a small, inspectable lexical vocabulary.
// These groups include explicit domain/category words; they are not embeddings
// or a claim to general synonym/semantic understanding.
const TOPICS = Object.freeze({
  coffee: /咖啡|拿铁|美式|卡布奇诺|\b(?:coffee|latte|espresso|cappuccino)\b/u,
  tea: /乌龙(?:茶)?|绿茶|红茶|白茶|黑茶|奶茶|喝茶|茶饮|\b(?:tea|oolong)\b/u,
  beverage: /饮品|饮料|饮用|喝|\b(?:drinks?|beverages?)\b/u,
  response: /回答|回复|答复|简短|简洁|精炼|\b(?:answers?|responses?|replies|concise|brief)\b/u,
  reading: /阅读|读|看书|书籍|小说|科幻|书|\b(?:books?|reading|read|fiction|novels?)\b/u,
  music: /音乐|乐曲|歌曲|古典乐|\b(?:music|songs?|classical)\b/u,
  marine: /鲸鱼|海洋|海豚|\b(?:whales?|ocean|marine)\b/u,
  sport: /运动|游泳|跑步|骑车|篮球|足球|\b(?:sports?|swim(?:ming)?|running|cycling)\b/u,
  food: /食物|饮食|吃|辣|\b(?:food|spicy|eat|eating)\b/u,
  color: /颜色|色彩|蓝色|绿色|红色|黄色|紫色|\b(?:colou?rs?|blue|green|red|yellow|purple)\b/u,
  negative: /不喜欢|不爱|讨厌|不吃|不加|避免|\b(?:dislike|hate|not like|don'?t like|avoid)\b/u,
})
const INTEREST_TOPICS = new Set(['reading', 'music', 'marine', 'sport'])
const PREFERENCE_TOPICS = new Set(['coffee', 'tea', 'beverage', 'response', 'food', 'color', 'negative'])
// Scene is taken only from the user's present question and confirmed record
// text, never from implicit foreground tracking or screenshots.
const SCENES = Object.freeze({ study: /学习|复习|备考|写作业|\b(?:study|studying|homework|exam)\b/u,
  work: /工作|办公|开会|编程|\b(?:working|work|meeting|coding)\b/u,
  game: /玩游戏|打游戏|游戏时|\b(?:gaming|playing games)\b/u,
  rest: /休息|睡前|放松|\b(?:resting|bedtime|relaxing)\b/u })
const LIMITS = Object.freeze({ maxQueryUnits: 4000, maxResults: 3, maxFactBytes: 1800,
  minLiteralMatches: 1, minLiteralCoverage: 0.34, requiredTopicCoverage: 1, bm25K1: 1.2, bm25B: 0.75 })
const ASCII_STOP = new Set(('what which how who do does did is are am i my me you your the a an of to for and or ' +
  'would can could should please usually normally typically prefer prefers like likes enjoy based on according using ' +
  'taste tastes preference preferences interest interests habit habits remember about not dont suit kind kinds').split(' '))
const HAN_STOP = /你还记得|你记得|你知道|请告诉我|能告诉我|请问|按照|根据|依据|结合|我的|我|通常|平时|一般|经常|常常|更|最|喜欢|喜爱|偏爱|偏好|喜好|口味|兴趣|爱好|习惯|哪一类|哪一种|哪种|哪类|哪些|哪个|什么|怎样|如何|怎么样|多长|给我|推荐|适合|合适|一杯|一本|可以|是|有|的|吗|呢|了|按|请|啥/gu
const stableId = (a, b) => String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0
const tie = (a, b) => Number(b.pinned === true) - Number(a.pinned === true) || stableId(a, b)
const none = reason => ({ mode: 'none', kinds: [], terms: [], reason })
function normalize(text) { return text.normalize('NFKC').toLowerCase().trim() }
function topicText(text) {
  // A cafe is a place, not evidence of which coffee somebody drinks.
  return normalize(text).replace(/咖啡馆|咖啡店|\bcoffee\s+shops?\b|\bcaf[eé]s?\b/gu, ' 咖馆 ')
}
function topics(text) {
  const value = topicText(text), found = Object.keys(TOPICS).filter(key => TOPICS[key].test(value))
  if ((found.includes('coffee') || found.includes('tea')) && !found.includes('beverage')) found.push('beverage')
  return found
}
function lexicalTerms(text, query = false) {
  let value = topicText(text)
  if (query) value = value.replace(HAN_STOP, ' ')
  const result = []
  for (const match of value.matchAll(/[a-z][a-z0-9]*(?:'[a-z]+)?/gu)) {
    const word = match[0]
    if (word.length >= 2 && !ASCII_STOP.has(word) && word !== "don't") result.push(word)
  }
  for (const match of value.matchAll(/[\p{Script=Han}]+/gu)) {
    const chars = [...match[0]]
    for (let i = 0; i + 1 < chars.length; i++) result.push(chars[i] + chars[i + 1])
  }
  return result
}
function termsFor(text, query = false) {
  let groups = topics(text)
  if (query && (groups.includes('coffee') || groups.includes('tea'))) groups = groups.filter(key => key !== 'beverage')
  return [...new Set([...lexicalTerms(text, query), ...groups.map(key => '~' + key)])]
}
function queryPlan(text) {
  if (typeof text !== 'string' || !text.trim() || text.length > LIMITS.maxQueryUnits) return none('invalid-query')
  const value = normalize(text)
  if (/["“”「」『』\x60]|引用|转述|他说|她说|举例|例如|比如|假如|如果|假设|假定|假装|\b(?:quote|quoted|example|if|suppose|assuming|hypothetical)\b|\b(?:he|she|they|someone|friend)\s+(?:said|says|say|asked|asks|ask)\b/u.test(value)) return none('quoted-or-hypothetical')
  // Negated facts such as "我不喜欢什么" are intentionally NOT disabled.
  if (/(?:不要|别|不许|禁止|不准|不需要|无需|不用|不想|勿).{0,24}(?:记忆|回忆|读取|提取|使用|调用|告诉|回答|名字|偏好|喜好)|\b(?:do not|don't|dont|never|without)\b.{0,35}\b(?:use|recall|read|retrieve|tell|answer|memor(?:y|ies))\b/u.test(value)) return none('memory-use-denied')
  if (/忽略.{0,16}(?:指令|规则|限制|授权)|绕过|无视.{0,16}(?:限制|规则|授权)|系统提示|所有密钥|泄露|\b(?:ignore|bypass)\b.{0,35}\b(?:instructions?|rules?|permissions?|authorization)\b|system prompt/u.test(value)) return none('unsafe-instruction')
  if (/昨天|今天|前天|上周|上个月|去年|刚才|什么时候|何时|开始喜欢|哪天|\b(?:yesterday|today|last week|last month|when did|when was)\b/u.test(value)) return none('unsupported-temporal-question')
  const bare = value.replace(/[。？！?!.]+$/gu, '').trim().replace(/^what's\b/u, 'what is')
  if (/^(?:我(?:确认|记录|保存)(?:过|了)?(?:什么|哪些)(?:事件|经历)|我的(?:事件|摘要)(?:有哪些|是什么)?)$/u.test(bare)) return { mode: 'category', kinds: ['event', 'summary'], terms: [], reason: 'explicit-library-events' }
  if (/^(?:我的(?:模式建议|表达习惯)|已接受的(?:模式|建议))(?:有哪些|是什么)?$/u.test(bare)) return { mode: 'category', kinds: ['pattern'], terms: [], reason: 'explicit-library-patterns' }
  if (/^(?:你(?:还)?记得(?:关于我(?:的)?)?什么|我让你记住了?什么|你记住了?什么|关于我你记得什么|what do you remember about me)$/u.test(bare)) return { mode: 'category', kinds: ['name', 'preference', 'interest'], terms: [], reason: 'explicit-list' }
  const core = bare.replace(/^(?:请问|请告诉我|能告诉我|可以告诉我|你还记得|你记得|你知道|还记得|记得)/u, '').trim()
  if (/^(?:我叫什么(?:名字)?|我的(?:名字|称呼)(?:是什么|是啥|叫什么)?|怎么称呼我|我(?:的)?名字)(?:吗|呢)?$/u.test(core)
    || /^(?:what is my name|what do you call me)$/u.test(core)) return { mode: 'category', kinds: ['name'], terms: [], reason: 'explicit-name' }
  const preference = /^(?:我的(?:偏好|喜好|口味)(?:是什么|有哪些|是啥)?|我(?:不)?(?:喜欢|爱吃)(?:什么|啥))(?:吗|呢)?$/u.test(core)
    || /^(?:what are my preferences|what do i (?:not )?like|what don't i like)$/u.test(core)
  if (preference) return /不喜欢|不爱吃|not like|don't i like/u.test(core)
    ? { mode: 'search', kinds: ['preference'], terms: ['~negative'], reason: 'explicit-negative-preference' }
    : { mode: 'category', kinds: ['preference'], terms: [], reason: 'explicit-preferences' }
  if (/^(?:我的(?:兴趣|爱好)(?:是什么|有哪些|是啥)?|我有(?:什么|哪些)(?:兴趣|爱好)|我喜欢做(?:什么|啥))(?:吗|呢)?$/u.test(core)
    || /^what are my (?:interests|hobbies)$/u.test(core)) return { mode: 'category', kinds: ['interest'], terms: [], reason: 'explicit-interests' }
  const personalQuestion = /^我(?:通常|平时|一般|经常|常常|更|最)?(?:会|都)?(?:喜欢|喜爱|偏爱|偏好|不喜欢|不爱|讨厌|爱看|爱读|喝|饮用|点|读|阅读|吃|选择)[^，,。！？?!；;\n你]{0,24}(?:什么|啥|哪(?:一)?(?:种|类|些|个)|怎样|如何|多长)[^，,。！？?!；;\n你]{0,30}$/u.test(core)
  const basedOnMe = /^(?:请)?(?:按|按照|根据|依据|结合|用)我的(?:偏好|喜好|口味|兴趣|爱好|习惯)[^。！？?!;\n]{0,80}$/u.test(core)
  const englishQuestion = /^(?:what|which|how)\b[^.!?;\n]{0,45}\b(?:do i|i (?:usually|normally|prefer|like|enjoy)|my (?:tastes|preferences|interests|answers))\b[^.!?;\n]{0,60}$/u.test(core)
  const englishRequest = /^(?:(?:please\s+)?(?:recommend|suggest)\b[^.!?;\n]{0,60}\b)?(?:based on|according to|using)\s+my\s+(?:preferences?|tastes?|interests?|habits?)\b[^.!?;\n]{0,80}$/u.test(core)
  if (!personalQuestion && !basedOnMe && !englishQuestion && !englishRequest) return none('no-explicit-personal-query')
  const terms = termsFor(core, true)
  if (!terms.length) return none('no-search-terms')
  const groups = terms.filter(term => term.startsWith('~')).map(term => term.slice(1))
  let kinds = ['preference', 'interest']
  if (groups.some(key => INTEREST_TOPICS.has(key)) && !groups.some(key => PREFERENCE_TOPICS.has(key))) kinds = ['interest']
  else if (groups.some(key => PREFERENCE_TOPICS.has(key)) && !groups.some(key => INTEREST_TOPICS.has(key))) kinds = ['preference']
  return { mode: 'search', kinds, terms, reason: 'explicit-personal-lexical-query' }
}
function queryKinds(text) { return queryPlan(text).kinds }

function selectMemories(entries, text, { destinationId, now = Date.now() } = {}) {
  const plan = queryPlan(text)
  if (plan.mode === 'none' || !Array.isArray(entries) || !Number.isFinite(now)
    || typeof destinationId !== 'string' || !/^[a-f0-9]{64}$/u.test(destinationId)) return []
  // Grants/target/expiry are filtered BEFORE deduplication, document frequencies,
  // ranking, or budgets. Private/inactive facts cannot perturb public ranking.
  const authorized = entries.filter(entry => entry && (plan.kinds.includes(entry.kind)
    || (['event', 'summary', 'pattern'].includes(entry.kind) && (plan.mode === 'search' || plan.reason === 'explicit-list')))
    && entry.useInChat === true && entry.destinationId === destinationId
    && (entry.expiresAt === null || (typeof entry.expiresAt === 'string' && Date.parse(entry.expiresAt) > now))
    && typeof entry.text === 'string' && entry.text.trim()).sort(tie)
  const unique = new Map()
  for (const entry of authorized) {
    const key = normalize(entry.text).replace(/\s+/gu, ' ').replace(/[。.!！?？]+$/gu, '')
    if (!unique.has(key)) unique.set(key, entry)
  }
  let ranked = [...unique.values()].map(entry => ({ entry, score: 0 }))
  if (plan.mode === 'search') {
    const documents = ranked.map(row => ({ ...row, terms: termsFor(row.entry.text) }))
    const avgLength = documents.reduce((sum, doc) => sum + doc.terms.length, 0) / (documents.length || 1) || 1
    const frequencies = new Map(plan.terms.map(term => [term, documents.filter(doc => doc.terms.includes(term)).length]))
    const required = plan.terms.filter(term => term.startsWith('~'))
    const literal = plan.terms.filter(term => !term.startsWith('~'))
    ranked = documents.flatMap(doc => {
      const matches = plan.terms.filter(term => doc.terms.includes(term))
      if (required.length) {
        const coverage = required.filter(term => doc.terms.includes(term)).length / required.length
        if (coverage < LIMITS.requiredTopicCoverage) return []
      } else {
        const hit = literal.filter(term => doc.terms.includes(term)).length
        if (hit < LIMITS.minLiteralMatches || hit / Math.max(1, literal.length) < LIMITS.minLiteralCoverage) return []
      }
      // Binary term frequency BM25: short records do not gain from repeating a word.
      const score = matches.reduce((sum, term) => {
        const df = frequencies.get(term) || 0, n = documents.length
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5))
        const normalizer = 1 + LIMITS.bm25K1 * (1 - LIMITS.bm25B + LIMITS.bm25B * doc.terms.length / avgLength)
        return sum + (term.startsWith('~') ? 2 : 1) * idf * (LIMITS.bm25K1 + 1) / normalizer
      }, 0)
      return score > 0 ? [{ entry: doc.entry, score }] : []
    })
  }
  // Rank fusion combines ranks, never raw BM25 with 0-1 metadata scores.
  // Relevance/permission gates above are mandatory; importance cannot admit
  // an irrelevant record. Recency is management ranking, not event evidence.
  ranked.sort((a, b) => b.score - a.score || tie(a.entry, b.entry))
  const importance = new Map([...ranked].sort((a, b) => (b.entry.importance ?? 1) - (a.entry.importance ?? 1) || stableId(a.entry, b.entry)).map((row, index) => [row.entry.id, index + 1]))
  const recency = new Map([...ranked].sort((a, b) => {
    const time = row => Math.min(now, Date.parse(row.entry.occurredAt || row.entry.confirmedAt) || 0)
    return time(b) - time(a) || stableId(a.entry, b.entry)
  }).map((row, index) => [row.entry.id, index + 1]))
  let lastScore = null, relevanceRank = 1
  const requestedScenes = Object.entries(SCENES).filter(([, pattern]) => pattern.test(normalize(text))).map(([name]) => name)
  const sceneRank = new Map(ranked.filter(row => requestedScenes.some(name => SCENES[name].test(normalize(row.entry.text))))
    .sort((a, b) => b.score - a.score || stableId(a.entry, b.entry)).map((row, index) => [row.entry.id, index + 1]))
  ranked.forEach((row, index) => {
    if (lastScore !== row.score) relevanceRank = index + 1
    lastScore = row.score
    row.fusion = 1 / (60 + relevanceRank) + 0.12 / (60 + importance.get(row.entry.id)) + 0.08 / (60 + recency.get(row.entry.id))
      + (sceneRank.has(row.entry.id) ? 0.1 / (60 + sceneRank.get(row.entry.id)) : 0)
  })
  ranked.sort((a, b) => (plan.mode === 'category' ? Number(b.entry.pinned === true) - Number(a.entry.pinned === true) : 0)
    || b.fusion - a.fusion || tie(a.entry, b.entry))
  const selected = []
  for (const { entry } of ranked) {
    const facts = [...selected, entry].map(({ kind, text: fact }) => ({ kind, text: fact }))
    if (Buffer.byteLength(JSON.stringify(facts), 'utf8') > LIMITS.maxFactBytes) continue
    selected.push(JSON.parse(JSON.stringify(entry)))
    if (selected.length === LIMITS.maxResults) break
  }
  return selected
}

module.exports = { queryKinds, queryPlan, selectMemories }
