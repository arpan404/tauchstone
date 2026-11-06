import { useEvidence, useMockStatus } from '@/api/hooks';
import { BoundaryBanner } from '@/components/BoundaryBanner';
import { MockRibbon } from '@/components/MockRibbon';
import { ProvenanceStrip } from '@/components/ProvenanceStrip';
import { exposureLabel } from '@/components/labels';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useUi } from '@/store/ui';
import { ProteinPanel } from '../protein-viewer/ProteinPanel';

function BrainBars({
  rows,
}: {
  rows: { context: string; ntpm: number }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.ntpm));
  return (
    <div className="mt-1 space-y-1" aria-label="Brain expression by region and cell type">
      {rows.map((r) => (
        <div key={r.context} className="flex items-center gap-2 text-xs tabular-nums">
          <span className="w-28 shrink-0 truncate text-neutral-600">{r.context}</span>
          <span className="relative inline-block h-2.5 flex-1 overflow-hidden rounded-sm bg-neutral-100">
            <span className="absolute top-0 bottom-0 left-0 bg-teal-700/70" style={{ width: `${(r.ntpm / max) * 100}%` }} />
          </span>
          <span className="w-12 shrink-0 text-right text-neutral-500">{r.ntpm.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

export function EvidenceView() {
  const { selectedCandidateId, setStep, setSessionId } = useUi();
  const { data, isLoading, isError } = useEvidence(selectedCandidateId);
  const mockData = useMockStatus(data?.provenance);

  return (
    <div className="flex h-full flex-col">
      <BoundaryBanner />
      <MockRibbon show={mockData} />
      <div className="flex-1 space-y-4 overflow-auto p-4">
        <h2 className="text-xl font-semibold">Evidence card</h2>
        {!selectedCandidateId && (
          <p className="text-sm text-neutral-500">
            Select a candidate from the leaderboard first — click any row in step 2.
          </p>
        )}
        {isLoading && selectedCandidateId && <Skeleton className="h-[300px] w-full" />}
        {isError && (
          <p role="alert" className="text-sm text-red-700">
            Could not load evidence for this candidate.
          </p>
        )}
        {data && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-lg font-semibold tabular-nums">
                {data.name}{' '}
                <span className="font-mono text-sm font-normal text-neutral-500">{data.candidate_id}</span>
              </p>
              <Badge variant={data.approval_status.status === 'approved' ? 'default' : 'secondary'}>
                {data.approval_status.status}
                {data.approval_status.max_phase !== undefined &&
                  data.approval_status.max_phase !== null &&
                  ` · phase ${data.approval_status.max_phase}`}
              </Badge>
              {data.chembl_id && (
                <span className="font-mono text-xs text-neutral-500">{data.chembl_id}</span>
              )}
            </div>
            {data.mechanism && <p className="text-sm text-neutral-600">{data.mechanism}</p>}

            <div className="grid gap-4 xl:grid-cols-2">
              {data.targets.map((t) => (
                <Card key={t.uniprot}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium">
                      {t.symbol}{' '}
                      <span className="font-mono font-normal text-neutral-500">
                        {t.uniprot} · Entrez {t.entrez_id}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {t.action_type && (
                      <p>
                        Action: <span className="font-medium">{t.action_type}</span>
                      </p>
                    )}
                    {t.ad_association_score !== undefined && t.ad_association_score !== null && (
                      <p className="tabular-nums">
                        Open Targets AD association:{' '}
                        <span className="font-semibold">{t.ad_association_score.toFixed(3)}</span>
                      </p>
                    )}
                    {t.brain_expression && <BrainBars rows={t.brain_expression} />}
                    {t.sources && (
                      <p className="text-xs">
                        {t.sources.map((s, i) => (
                          <span key={s.label}>
                            {i > 0 && ' · '}
                            <a className="text-teal-800 underline" href={s.url} target="_blank" rel="noreferrer">
                              {s.label}
                            </a>
                          </span>
                        ))}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Brain exposure</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p>
                  Level:{' '}
                  <Badge variant="outline" className="border-teal-700 text-teal-900">
                    {exposureLabel(data.brain_exposure.level)}
                  </Badge>
                </p>
                <p className="mt-1 text-neutral-600">{data.brain_exposure.summary}</p>
                {data.brain_exposure.sources && (
                  <p className="mt-1 text-xs">
                    {data.brain_exposure.sources.map((s, i) => (
                      <span key={s.label}>
                        {i > 0 && ' · '}
                        <a className="text-teal-800 underline" href={s.url} target="_blank" rel="noreferrer">
                          {s.label}
                        </a>
                      </span>
                    ))}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Protein structure (target context)</CardTitle>
              </CardHeader>
              <CardContent>
                <ProteinPanel url={data.structure?.url ?? null} note={data.structure?.note ?? null} />
              </CardContent>
            </Card>

            <p className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              {data.boundary}
            </p>

            <div>
              <Button
                size="lg"
                onClick={() => {
                  setSessionId(null);
                  setStep('attack');
                }}
              >
                Attack this candidate
              </Button>
            </div>
          </>
        )}
      </div>
      <ProvenanceStrip provenance={data?.provenance} />
    </div>
  );
}
