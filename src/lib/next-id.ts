/** Generate a short random identifier (for React keys / form rows). */
export function nextId(): string {
  return Math.random().toString(36).slice(2)
}
