import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'

function emptySnapshot() {
  return { version: 1, drafts: [], history: [] }
}

function validateSnapshot(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.drafts) || !Array.isArray(value.history)) {
    throw new Error('snapshot schema is invalid')
  }
  return value
}

export class MemoryStore {
  constructor(initial) {
    const data = initial ? validateSnapshot(structuredClone(initial)) : emptySnapshot()
    this.data = data
  }
  persist() {}
  transaction(action) {
    const before = structuredClone(this.data)
    try {
      const result = action(this.data)
      this.persist()
      return structuredClone(result)
    } catch (error) {
      this.data = before
      throw error
    }
  }
  listDrafts() { return structuredClone([...this.data.drafts].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) }
  getDraft(id) { const value = this.data.drafts.find((draft) => draft.id === id); return value ? structuredClone(value) : undefined }
  listHistory() { return structuredClone(this.data.history) }
}

export class FileStore extends MemoryStore {
  constructor(dataDir = process.env.DATA_DIR || path.resolve('server/data')) {
    fs.mkdirSync(dataDir, { recursive: true })
    const file = path.join(dataDir, 'store.json')
    const existed = fs.existsSync(file)
    let initial
    if (existed) {
      try { initial = validateSnapshot(JSON.parse(fs.readFileSync(file, 'utf8'))) }
      catch (error) {
        throw new Error(`DraftDeck data at ${file} is corrupt; refusing to overwrite it. Restore ${file}.bak or repair it. Cause: ${error.message}`)
      }
    }
    super(initial)
    this.file = file
    if (!existed) this.persist()
  }
  persist() {
    if (!this.file) return
    const temporary = `${this.file}.tmp`
    fs.writeFileSync(temporary, JSON.stringify(this.data, null, 2), { mode: 0o600 })
    if (fs.existsSync(this.file)) fs.copyFileSync(this.file, `${this.file}.bak`)
    fs.renameSync(temporary, this.file)
  }
}

export function addHistory(snapshot, entry) {
  snapshot.history.unshift({ id: randomUUID(), at: new Date().toISOString(), ...entry })
  if (snapshot.history.length > 1_000) snapshot.history.length = 1_000
}
