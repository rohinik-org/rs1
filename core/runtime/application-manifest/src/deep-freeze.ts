export function deepFreeze<T>(value: T): T {
  const visited = new WeakSet<object>()
  function freeze(cur: unknown): void {
    if (cur === null || typeof cur !== 'object') return
    if (visited.has(cur)) return
    visited.add(cur)
    for (const key of Reflect.ownKeys(cur)) Reflect.get(cur, key) !== null && freeze(Reflect.get(cur, key))
    Object.freeze(cur)
  }
  freeze(value)
  return value
}
