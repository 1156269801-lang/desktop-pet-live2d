'use strict';

const MAX_PERSONA_BYTES = 10000;
function invalid() {
  const error = new Error('Persona data is invalid.');
  error.code = 'PERSONA_INVALID';
  return error;
}
function fields(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (actual.length !== keys.length || actual.some(key => typeof key !== 'string' || !keys.includes(key)
    || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value'))) throw invalid();
  return Object.fromEntries(keys.map(key => [key, descriptors[key].value]));
}
function text(value, minimum, maximum, multiline = false) {
  if (typeof value !== 'string' || value.length > MAX_PERSONA_BYTES
    || Buffer.byteLength(value, 'utf8') > MAX_PERSONA_BYTES
    || Buffer.from(value, 'utf8').toString('utf8') !== value) throw invalid();
  const normalized = multiline ? value.replace(/\r\n/g, '\n') : value;
  if (/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(multiline ? normalized.replace(/\n/g, '') : normalized)) throw invalid();
  const clean = normalized.normalize('NFC').trim();
  const length = Array.from(clean).length;
  if (length < minimum || length > maximum) throw invalid();
  return clean;
}
function choice(value, allowed) {
  if (!allowed.includes(value)) throw invalid();
  return value;
}
function strings(value, count, maximum) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length > count) throw invalid();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== value.length + 1 || keys.some(key => key !== 'length'
    && (typeof key !== 'string' || !/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= value.length
      || !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], 'value')))) throw invalid();
  return Array.from({ length: value.length }, (_, index) => text(descriptors[String(index)].value, 1, maximum));
}
function validatePersona(input) {
  try {
    const p = fields(input, ['schemaVersion', 'personaId', 'identity', 'temperament', 'voice', 'interactionStyle', 'styleNotes']);
    if (p.schemaVersion !== 1 || p.personaId !== 'dafeiyu-default') throw invalid();
    const identity = fields(p.identity, ['name', 'role']);
    const temperament = fields(p.temperament, ['warmth', 'playfulness', 'initiative']);
    const voice = fields(p.voice, ['language', 'defaultLength', 'address', 'catchphrases', 'avoid']);
    const interaction = fields(p.interactionStyle, ['companionship', 'humor']);
    const clean = {
      schemaVersion: 1, personaId: 'dafeiyu-default',
      identity: { name: text(identity.name, 1, 40), role: text(identity.role, 1, 160) },
      temperament: {
        warmth: choice(temperament.warmth, ['gentle', 'neutral', 'lively']),
        playfulness: choice(temperament.playfulness, ['low', 'medium', 'high']),
        initiative: choice(temperament.initiative, ['restrained', 'balanced']),
      },
      voice: {
        language: choice(voice.language, ['zh-CN']), defaultLength: choice(voice.defaultLength, ['short', 'normal']),
        address: text(voice.address, 0, 40), catchphrases: strings(voice.catchphrases, 3, 40), avoid: strings(voice.avoid, 5, 80),
      },
      interactionStyle: { companionship: text(interaction.companionship, 0, 200), humor: text(interaction.humor, 0, 200) },
      styleNotes: text(p.styleNotes, 0, 2000, true),
    };
    if (Buffer.byteLength(JSON.stringify(clean), 'utf8') > MAX_PERSONA_BYTES) throw invalid();
    return clean;
  } catch { throw invalid(); }
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
const DEFAULT_PERSONA = freeze(validatePersona({
  schemaVersion: 1, personaId: 'dafeiyu-default',
  identity: { name: '大肥鱼', role: '虚构的鲸鱼女仆桌面伙伴' },
  temperament: { warmth: 'gentle', playfulness: 'low', initiative: 'restrained' },
  voice: { language: 'zh-CN', defaultLength: 'short', address: '你', catchphrases: ['……'], avoid: ['说教', '反复催促', '每句都提问'] },
  interactionStyle: { companionship: '自然陪伴，尊重用户的注意力与边界。', humor: '偶尔轻松俏皮，不讽刺或催促。' },
  styleNotes: '',
}));
module.exports = Object.freeze({ DEFAULT_PERSONA, validatePersona, MAX_PERSONA_BYTES });
