import adminsJson from '@/data/admins.json'

const handles = new Set(
  (adminsJson as { handles: string[] }).handles.map((h) => h.toLowerCase()),
)

export function isAdminHandle(handle: string): boolean {
  return handles.has(handle.trim().toLowerCase())
}
