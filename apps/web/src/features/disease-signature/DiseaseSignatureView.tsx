import { useSignature, useMockStatus } from '@/api/hooks';
import { BoundaryBanner } from '@/components/BoundaryBanner';
import { MockRibbon } from '@/components/MockRibbon';
import { ProvenanceStrip } from '@/components/ProvenanceStrip';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { SignCheckTable } from './SignCheckTable';
import { VolcanoPlot } from './VolcanoPlot';

export function DiseaseSignatureView() {
  const { data, isLoading, isError } = useSignature('GSE132903');
  const mockData = useMockStatus(data?.provenance);

  return (
    <div className="flex h-full flex-col">
      <BoundaryBanner />
      <MockRibbon show={mockData} />
      <div className="flex-1 space-y-4 overflow-auto p-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h2 className="text-xl font-semibold">Disease signature</h2>
          {data && (
            <p className="text-sm text-neutral-500" aria-label="Cohort summary">
              {data.cohort} · {data.tissue} · {data.method} ·{' '}
              <span className="tabular-nums">
                n AD {data.n_ad} / n control {data.n_control}
              </span>{' '}
              · <span className="tabular-nums">{data.n_fdr05?.toLocaleString()} genes FDR&lt;0.05</span>
            </p>
          )}
        </div>

        {isLoading && <Skeleton className="h-[420px] w-full" />}
        {isError && (
          <p role="alert" className="text-sm text-red-700">
            Could not load the signature.
          </p>
        )}
        {data && (
          <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Volcano: AD minus control (warm = up in AD, teal = down in AD)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <VolcanoPlot genes={data.genes} />
                <p className="mt-1 text-xs text-neutral-500">
                  Dashed line: FDR 0.05. Emphasised points are the LINCS query set (top 150 up /
                  down).
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Sign check (known AD genes)</CardTitle>
              </CardHeader>
              <CardContent>
                {data.sign_check && <SignCheckTable rows={data.sign_check} />}
                <p className="mt-2 text-xs text-neutral-500">
                  Positive stat = higher in AD. GFAP expected up; SST / VGF expected down.
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
      <ProvenanceStrip provenance={data?.provenance} />
    </div>
  );
}
