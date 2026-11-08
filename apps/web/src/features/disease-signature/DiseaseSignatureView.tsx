import { GeneSearch } from './GeneSearch';
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
      <div className="flex-1 space-y-6 overflow-auto p-5 lg:p-7">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          {data && (
            <p className="text-sm text-muted-foreground" aria-label="Cohort summary">
              {data.cohort} · {data.tissue} · {data.method} ·{' '}
              <span className="tabular-nums">
                n Alzheimer's {data.n_ad} / n control {data.n_control}
              </span>{' '}
              · <span className="tabular-nums">{data.n_fdr05?.toLocaleString()} genes FDR&lt;0.05</span>
            </p>
          )}
        </div>

        {isLoading && <Skeleton className="h-[420px] w-full" />}
        {isError && (
          <p role="alert" className="text-sm text-destructive">
            Could not load the signature.
          </p>
        )}
        {data && (
          <>
          <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Alzheimer's vs control (warm = up in Alzheimer's, blue = down)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <VolcanoPlot genes={data.genes} />
                <p className="mt-1 text-xs text-muted-foreground">
                  Dashed line FDR 0.05. Highlighted points are the top 150 up and top 150 down genes
                  sent to LINCS.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Sign check on known Alzheimer's genes</CardTitle>
              </CardHeader>
              <CardContent>
                {data.sign_check && <SignCheckTable rows={data.sign_check} />}
                <p className="mt-2 text-xs text-muted-foreground">
                  Positive stat = higher in Alzheimer's. GFAP expected up, SST and VGF expected down.
                </p>
              </CardContent>
            </Card>
          </div>
          <GeneSearch genes={data.genes} />
          </>
        )}
      </div>
      <ProvenanceStrip provenance={data?.provenance} />
    </div>
  );
}
