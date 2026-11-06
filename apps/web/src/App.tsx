import { useQuery } from '@tanstack/react-query'
import { api } from '@/api/client'
import { BoundaryBanner } from '@/components/BoundaryBanner'

export default function App() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<{ status: string; mock: boolean }>('/health'),
  })

  return (
    <div className="min-h-screen bg-background text-foreground">
      <BoundaryBanner />
      <header className="px-6 py-5">
        <h1 className="text-2xl font-semibold">Tauchstone: Second Life</h1>
        <p className="text-muted-foreground">Find a drug. Attack the hypothesis. Keep only what survives.</p>
      </header>
      <main className="px-6 text-sm text-muted-foreground">
        API: {health.isLoading ? 'checking…' : health.isError ? 'unreachable' : `${health.data?.status}${health.data?.mock ? ' (mock data)' : ''}`}
      </main>
    </div>
  )
}
