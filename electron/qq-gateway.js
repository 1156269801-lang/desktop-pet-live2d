/**
 * QQ 网关（OneBot 11 正向 WebSocket 客户端）。
 *
 * 桌宠作为客户端连 NapCat / Lagrange / go-cqhttp 的正向 WS，
 * 收到群消息 / 私聊后交给 onText，由主进程复用 handleChatText 回复，
 * 回复再经 send_group_msg / send_private_msg 发回 QQ。
 *
 * 只依赖可选的 ws 包；缺包时 startQQGateway 返回 null 且不会让主进程崩。
 */
'use strict'

let WebSocketImpl = null
try {
  // eslint-disable-next-line global-require
  WebSocketImpl = require('ws')
} catch {
  WebSocketImpl = null
}

const RECONNECT_MS = 5000

function readString(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : ''
}

/** 从 OneBot 消息段数组里拆出「纯文本」和「@ 目标」；兼容 raw_message 字符串 */
function splitMessage(message) {
  if (!Array.isArray(message)) {
    const raw = readString(message, 4000)
    const at = /\[CQ:at,qq=([^,\]]+)\]/.exec(raw)
    const text = raw.replace(/\[CQ:[^\]]*\]/g, '').trim()
    return { text, atTarget: at ? at[1] : '' }
  }
  const texts = []
  let atTarget = ''
  for (const seg of message) {
    if (!seg || typeof seg !== 'object') continue
    if (seg.type === 'text' && seg.data && typeof seg.data.text === 'string') texts.push(seg.data.text)
    else if (seg.type === 'at' && seg.data && seg.data.qq !== undefined) atTarget = String(seg.data.qq)
  }
  return { text: texts.join('').trim(), atTarget }
}

function isGroupEnabled(qq, groupId) {
  // 群白名单：留空 = 全部群；非空 = 只回这些群
  const list = Array.isArray(qq.groups) ? qq.groups.map(String) : []
  return list.length === 0 || list.includes(String(groupId))
}

/**
 * qqConfig: config.qq
 * hooks: { onText(text, meta), log(...), notify(text) }
 * 返回 { sendText(chatType, chatId, text), close(), connected, ready } 或 null（未启用）
 */
function startQQGateway(qqConfig, hooks = {}) {
  if (!qqConfig || qqConfig.enabled !== true) return null
  const onText = typeof hooks.onText === 'function' ? hooks.onText : null
  const log = typeof hooks.log === 'function' ? hooks.log : (...args) => console.log('[qq]', ...args)
  const notify = typeof hooks.notify === 'function' ? hooks.notify : null
  if (!onText) return null
  if (!WebSocketImpl) {
    log('未安装 ws，QQ 网关无法启动')
    return null
  }

  const wsUrl = readString(qqConfig.wsUrl, 512)
  if (!/^wss?:\/\//.test(wsUrl)) {
    log('wsUrl 非法：' + wsUrl)
    return null
  }
  const accessToken = readString(qqConfig.accessToken, 512)
  const selfId = String(qqConfig.selfId || '')
  const adminQq = String(qqConfig.adminQq || '')
  const atOnly = qqConfig.atOnly !== false

  let socket = null
  let closing = false

  function sendRaw(action, params) {
    if (!socket || socket.readyState !== WebSocketImpl.OPEN) return false
    try {
      socket.send(JSON.stringify({ action, params, echo: 'pet-' + Date.now() }))
      return true
    } catch (error) {
      log('发送失败：' + error.message)
      return false
    }
  }

  function sendText(chatType, chatId, text) {
    if (!text) return false
    if (chatType === 'group') return sendRaw('send_group_msg', { group_id: chatId, message: text })
    return sendRaw('send_private_msg', { user_id: chatId, message: text })
  }

  function accept(event) {
    if (!event || event.post_type !== 'message') return
    const messageType = event.message_type
    if (messageType !== 'group' && messageType !== 'private') return
    const senderId = String((event.sender && (event.sender.user_id || event.sender.userId)) || event.user_id || '')
    if (senderId && selfId && senderId === selfId) return // 自己发的消息不回

    const { text, atTarget } = splitMessage(event.message !== undefined ? event.message : event.raw_message)
    if (!text) return
    if (text.length > 500) return // 太长不处理

    const isGroup = messageType === 'group'
    if (isGroup) {
      if (!isGroupEnabled(qqConfig, event.group_id)) return
      if (atOnly) {
        const atMe = selfId ? atTarget === selfId : Boolean(atTarget)
        if (!atMe) return
      }
    } else if (adminQq && senderId && senderId !== adminQq) {
      // 私聊：配了 adminQq 就只收管理员的
      return
    }

    const meta = {
      source: 'qq',
      name: readString(event.sender && (event.sender.card || event.sender.nickname), 40),
      chatId: isGroup ? event.group_id : event.user_id,
      chatType: messageType,
      senderId,
    }
    onText(text, meta)
  }

  function connect() {
    if (closing) return
    const options = accessToken ? { headers: { Authorization: 'Bearer ' + accessToken } } : undefined
    try {
      socket = new WebSocketImpl(wsUrl, options)
    } catch (error) {
      log('连接失败：' + error.message)
      setTimeout(connect, RECONNECT_MS)
      return
    }
    socket.on('open', () => {
      log('已连接 ' + wsUrl)
      if (notify) notify('QQ 网关已连接')
    })
    socket.on('message', (data) => {
      let event
      try {
        event = JSON.parse(String(data))
      } catch {
        return
      }
      try {
        accept(event)
      } catch (error) {
        log('处理消息失败：' + error.message)
      }
    })
    socket.on('close', () => {
      if (closing) return
      log('断开，' + RECONNECT_MS + 'ms 后重连')
      setTimeout(connect, RECONNECT_MS)
    })
    socket.on('error', (error) => {
      log('ws 错误：' + (error && error.message ? error.message : String(error)))
    })
  }

  connect()

  return {
    sendText,
    close() {
      closing = true
      try {
        if (socket) socket.close()
      } catch {
        /* ignore */
      }
    },
  }
}

module.exports = { startQQGateway, splitMessage }
