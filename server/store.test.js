import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FileStore, MemoryStore } from './store.js'

describe('store durability', () => {
  it('rolls memory back when persistence fails', () => {
    class FlakyStore extends MemoryStore {
      fail = false
      persist() { if (this.fail) throw new Error('disk full') }
    }
    const store = new FlakyStore()
    store.fail = true
    expect(() => store.transaction((snapshot) => snapshot.drafts.push({ id: 'x' }))).toThrow(/disk full/)
    expect(store.listDrafts()).toEqual([])
  })

  it('backs up snapshots and fails closed on corruption', () => {
    const directory = fs.mkdtempSync(path.join(process.cwd(), '.tmp', 'store-'))
    try {
      const store = new FileStore(directory)
      store.transaction((snapshot) => snapshot.history.push({ id: 'h', at: new Date().toISOString(), type: 'test' }))
      expect(fs.existsSync(path.join(directory, 'store.json.bak'))).toBe(true)
      fs.writeFileSync(path.join(directory, 'store.json'), '{broken')
      expect(() => new FileStore(directory)).toThrow(/corrupt; refusing to overwrite/)
      expect(fs.readFileSync(path.join(directory, 'store.json'), 'utf8')).toBe('{broken')
    } finally { fs.rmSync(directory, { recursive: true, force: true }) }
  })
})
