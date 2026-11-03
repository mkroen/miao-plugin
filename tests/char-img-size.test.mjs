import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)
const sizeModule = process.env.IMAGE_SIZE_MODULE || 'image-size'
const imported = require(sizeModule)
const sizeOf = imported.imageSize || imported.default || imported
const source = fs.readFileSync(path.join(root, 'models/character/CharImg.js'), 'utf8')
const start = source.indexOf('  getCardImg (')
const end = source.indexOf('  getRandomImg (', start)
assert.ok(start >= 0 && end > start)
const method = source.slice(start, end).trim().replace(/,$/, '')
const lodash = { isArray: Array.isArray, forEach: (items, fn) => items.forEach(fn), sample: items => items[0] }
const subject = new Function('fs', 'lodash', 'sizeOf', 'return ({' + method + '})')(fs, lodash, sizeOf)
const cwd = process.cwd()
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'char-img-test-'))
try {
  process.chdir(tmp)
  const dir = 'plugins/miao-plugin/resources/character-img/test'
  fs.mkdirSync(dir, { recursive: true })
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aXioAAAAASUVORK5CYII=', 'base64')
  fs.writeFileSync(dir + '/fixture.png', png)
  const result = subject.getCardImg('test')
  assert.equal(result.width, 1)
  assert.equal(result.height, 1)
  assert.equal(result.mode, 'bottom')
  assert.equal(result.img, 'character-img/test/fixture.png')
  png.writeUInt32BE(2, 16)
  fs.writeFileSync(dir + '/fixture.png', png)
  assert.equal(subject.getCardImg('test').mode, 'left')
  fs.unlinkSync(dir + '/fixture.png')
  assert.equal(subject.getCardImg('test'), false)
  assert.equal(subject.getCardImg('test', false, false), false)
  console.log('PASS: image dimensions, portrait/landscape mode, empty gallery')
} finally {
  process.chdir(cwd)
  fs.rmSync(tmp, { recursive: true, force: true })
}
