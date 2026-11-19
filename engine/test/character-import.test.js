'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { importCharacter } = require('../../electron/character-import')

const model = JSON.stringify({ Version: 3, FileReferences: {} })
function fixture(t) {
  const temp = fs.mkdtempSync(path.join(__dirname, 'import-fixture-'))
  const output = path.join(temp, 'characters')
  t.after(() => { if (path.dirname(fs.realpathSync(temp)) === fs.realpathSync(__dirname)) fs.rmSync(temp, { recursive: true }) })
  const load = (source) => importCharacter(path.join(temp, source), output, ['hello'], (id) =>
    JSON.parse(fs.readFileSync(path.join(output, id, 'manifest.json'), 'utf8')))
  return { temp, output, load }
}

function storedZip(file, data) {
  const name = Buffer.from(file), body = Buffer.from(data)
  const local = Buffer.alloc(30), central = Buffer.alloc(46), end = Buffer.alloc(22)
  local.writeUInt32LE(0x04034b50); local.writeUInt16LE(name.length, 26)
  local.writeUInt32LE(body.length, 18); local.writeUInt32LE(body.length, 22)
  central.writeUInt32LE(0x02014b50); central.writeUInt16LE(name.length, 28)
  central.writeUInt32LE(body.length, 20); central.writeUInt32LE(body.length, 24)
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + name.length + body.length, 16)
  return Buffer.concat([local, name, body, central, name, end])
}

test('nested folder manifest keeps display name and normalizes relative paths', (t) => {
  const { temp, load } = fixture(t)
  const nested = path.join(temp, 'folder', 'nested', 'art')
  fs.mkdirSync(nested, { recursive: true })
  fs.writeFileSync(path.join(nested, 'avatar.json'), model)
  fs.writeFileSync(path.join(nested, '..', 'manifest.json'), JSON.stringify({ name: '测试角色', model: 'art\\avatar.json' }))
  const { character } = load('folder')
  assert.equal(character.model, 'nested/art/avatar.json')
  assert.equal(character.name, '测试角色')
  assert.equal(load('folder').character.id, 'folder-2')
})

test('ZIP with nested model is imported by the same API', (t) => {
  const { temp, load, output } = fixture(t)
  fs.writeFileSync(path.join(temp, 'model.zip'), storedZip('folder/model3.json', model))
  const { character, files } = load('model.zip')
  assert.equal(character.model, 'folder/model3.json')
  assert.equal(files, 1)
  assert.equal(fs.readFileSync(path.join(output, character.id, character.model), 'utf8'), model)
})

test('missing model and malformed ZIP leave no partial role', (t) => {
  const { temp, output, load } = fixture(t)
  fs.mkdirSync(path.join(temp, 'empty'))
  fs.writeFileSync(path.join(temp, 'broken.zip'), 'not a zip')
  assert.throws(() => load('empty'), /manifest\.json/)
  assert.throws(() => load('broken.zip'), /解压失败/)
  assert.deepEqual(fs.readdirSync(output), [])
})

test('ZIP rejects traversal and NTFS alternate streams', (t) => {
  const { temp, output, load } = fixture(t)
  for (const illegal of ['../escaped.json', 'model3.json:stream']) {
    fs.writeFileSync(path.join(temp, 'invalid.zip'), storedZip(illegal, model))
    assert.throws(() => load('invalid.zip'), /不安全的路径/)
  }
  assert.deepEqual(fs.readdirSync(output), [])
})
