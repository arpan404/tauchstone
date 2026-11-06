// All API calls go through /api, proxied to FastAPI (see vite.config.ts).
// Response types will be generated from contracts/openapi.yaml once the contract is frozen.
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) throw new Error(`${init?.method ?? 'GET'} ${path} failed: ${res.status}`)
  return res.json() as Promise<T>
}
