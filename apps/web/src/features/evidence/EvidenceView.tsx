import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
          <span className="w-28 shrink-0 truncate text-muted-foreground">{r.context}</span>
          <span className="relative inline-block h-2.5 flex-1 overflow-hidden rounded-sm bg-muted">
            <span className="absolute top-0 bottom-0 left-0 bg-primary" style={{ width: `${(r.ntpm / max) * 100}%` }} />
          </span>
          <span className="w-12 shrink-0 text-right text-muted-foreground">{r.ntpm.toFixed(1)}</span>
        </div>
      ))}
    </div>
  );
}

export function EvidenceView() {
  const { selectedCandidateId, setStep } = useUi();
  const { data, isLoading, isError } = useEvidence(selectedCandidateId);
  const mockData = useMockStatus(data?.provenance);

  return (
    <div className="flex h-full flex-col">
      <BoundaryBanner />
      <MockRibbon show={mockData} />
      <div className="flex-1 space-y-6 overflow-auto p-5 lg:p-7">
        <h2 className="text-xl font-semibold">Candidate evidence</h2>
        {!selectedCandidateId && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Select a candidate to inspect its targets, brain expression and evidence sources.
            </p>
            <Button onClick={() => setStep('candidates')}>Explore candidates</Button>
          </div>
        )}
        {isLoading && selectedCandidateId && <Skeleton className="h-[300px] w-full" />}
        {isError && (
          <p role="alert" className="text-sm text-destructive">
            Could not load evidence for this candidate.
          </p>
        )}
        {data && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-lg font-semibold tabular-nums">
                {data.name}{' '}
                <span className="text-sm font-normal text-muted-foreground">{data.candidate_id}</span>
              </p>
              <Badge variant={data.approval_status.status === 'approved' ? 'default' : 'secondary'}>
                {data.approval_status.status}
                {data.approval_status.max_phase !== undefined &&
                  data.approval_status.max_phase !== null &&
                  ` · phase ${data.approval_status.max_phase}`}
              </Badge>
              {data.chembl_id && (
                <span className="text-xs text-muted-foreground">{data.chembl_id}</span>
              )}
            </div>
            {data.mechanism && <p className="text-sm text-muted-foreground">{data.mechanism}</p>}

            <section aria-label="Target evidence" className="space-y-4">
              {data.targets.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No mechanism-of-action targets recorded in Open Targets for this drug.
                </p>
              )}
              <Tabs key={data.candidate_id} defaultValue={data.targets[0]?.uniprot}>
              {data.targets.length > 1 && <TabsList aria-label="Choose target" className="max-w-full overflow-x-auto">{data.targets.map(t => <TabsTrigger key={t.uniprot} value={t.uniprot}>{t.symbol}</TabsTrigger>)}</TabsList>}
              {data.targets.map((t) => (
                <TabsContent key={t.uniprot} value={t.uniprot} className="rounded-lg border border-border bg-card p-5">
                  <div className="mb-4">
                    <h3 className="text-sm font-medium">
                      {t.symbol}{' '}
                      <span className="font-mono font-normal text-muted-foreground">
                        {t.uniprot} · Entrez {t.entrez_id}
                      </span>
                    </h3>
                  </div>
                  <div className="space-y-4 text-sm">
                    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[140px_1fr]">
                      <dt className="text-muted-foreground">UniProt</dt><dd>{t.uniprot}</dd>
                      <dt className="text-muted-foreground">Entrez ID</dt><dd>{t.entrez_id}</dd>
                      {t.ensembl_id && <><dt className="text-muted-foreground">Ensembl</dt><dd>{t.ensembl_id}</dd></>}
                    </dl>
                    {t.action_type && (
                      <dl className="grid grid-cols-[140px_1fr] gap-2"><dt className="text-muted-foreground">Action</dt><dd className="font-medium">{t.action_type}</dd></dl>
                    )}
                    {t.ad_association_score !== undefined && t.ad_association_score !== null && (
                      <p className="tabular-nums">
                        Open Targets AD association:{' '}
                        <span className="font-semibold">{t.ad_association_score.toFixed(3)}</span>
                      </p>
                    )}
                    {t.brain_expression && <div className="max-w-2xl space-y-3 border-t border-border pt-4"><h4 className="text-xs font-medium text-muted-foreground">Brain expression · nTPM</h4><BrainBars rows={t.brain_expression} /></div>}
                    {t.sources && (
                      <p className="text-xs">
                        {t.sources.map((s, i) => (
                          <span key={s.label}>
                            {i > 0 && ' · '}
                            <a className="text-primary underline" href={s.url} target="_blank" rel="noreferrer">
                              {s.label}
                            </a>
                          </span>
                        ))}
                      </p>
                    )}
                  </div>
                </TabsContent>
              ))}
              </Tabs>
            </section>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Brain exposure</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <p>
                  Level:{' '}
                  <Badge variant="outline" className="border-border text-primary">
                    {exposureLabel(data.brain_exposure.level)}
                  </Badge>
                </p>
                <p className="mt-1 text-muted-foreground">{data.brain_exposure.summary}</p>
                {data.brain_exposure.sources && (
                  <p className="mt-1 text-xs">
                    {data.brain_exposure.sources.map((s, i) => (
                      <span key={s.label}>
                        {i > 0 && ' · '}
                        <a className="text-primary underline" href={s.url} target="_blank" rel="noreferrer">
                          {s.label}
                        </a>
                      </span>
                    ))}
                  </p>
                )}
              </CardContent>
            </Card>

            <section className="space-y-3 border-t border-border pt-5">
              <h3 className="text-sm font-medium">Protein structure (target context)</h3>
                <ProteinPanel url={data.structure?.url ?? null} note={data.structure?.note ?? null} />
              </section>

            <Alert><AlertDescription>{data.boundary}</AlertDescription></Alert>

            <div>
              <Button
                size="lg"
                onClick={() => {
                  setStep('attack');
                }}
              >
                Open experiments
              </Button>
            </div>
          </>
        )}
      </div>
      <ProvenanceStrip provenance={data?.provenance} />
    </div>
  );
}
