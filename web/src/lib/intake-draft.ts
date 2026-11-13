/** 每个标签保留自己的草稿；本机记录最近一份，重新打开时可继续。 */
export type IntakeDraft = {
  id: string
  text: string
  status: "pending" | "sent"
}

const KEY = "ab:intake-draft"
let memoryDraft: IntakeDraft | null | undefined

export function getIntakeDraft(): IntakeDraft | null {
  if (memoryDraft !== undefined) return memoryDraft
  for (const read of [() => sessionStorage.getItem(KEY), () => localStorage.getItem(KEY)]) {
    try {
      const raw = read()
      const value = raw ? JSON.parse(raw) as Partial<IntakeDraft> : null
      if (value && typeof value.id === "string" && typeof value.text === "string"
        && (value.status === "pending" || value.status === "sent")) {
        memoryDraft = value as IntakeDraft
        return memoryDraft
      }
    } catch { /* Try the other store, then fall back to this tab's memory. */ }
  }
  memoryDraft = null
  return memoryDraft
}

function persist(draft: IntakeDraft) {
  memoryDraft = draft
  try {
    sessionStorage.setItem(KEY, JSON.stringify(draft))
  } catch {
    // 隐私模式禁用存储时，仍能在本次页面会话里传递想法。
  }
  try { localStorage.setItem(KEY, JSON.stringify(draft)) } catch { /* Optional cross-tab recovery. */ }
}

export function saveIntakeDraft(text: string): IntakeDraft {
  const current = getIntakeDraft()
  const draft: IntakeDraft = { id: current?.status === "pending" ? current.id : crypto.randomUUID(), text: text.trim(), status: "pending" }
  persist(draft)
  return draft
}

/** Save edits before route changes, while keeping the same pending conversation id. */
export function editIntakeDraft(text: string) {
  const current = getIntakeDraft()
  if (!text.trim()) {
    if (current?.status !== "pending") return
    for (const storage of [() => sessionStorage, () => localStorage]) {
      try {
        const store = storage()
        if (JSON.parse(store.getItem(KEY) || "null")?.id === current.id) store.removeItem(KEY)
      } catch { /* The in-memory draft still clears if storage is unavailable. */ }
    }
    memoryDraft = null
    return
  }
  persist({ id: current?.status === "pending" ? current.id : crypto.randomUUID(), text, status: "pending" })
}

export function hasPendingIntakeDraft() {
  return getIntakeDraft()?.status === "pending"
}

/** 发送前同步标记，避免 StrictMode、返回页面或刷新再次自动发送。 */
export function claimIntakeDraft(id: string): IntakeDraft | null {
  const draft = getIntakeDraft()
  if (!draft || draft.id !== id || draft.status !== "pending") return null
  persist({ ...draft, status: "sent" })
  return draft
}
