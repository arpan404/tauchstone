import { useCandidates } from '@/api/hooks';
import type { Schema } from '@/api/schema';
import { MOCK_CELL_LINES } from '@/api/mock/candidates';
import { BoundaryBanner } from '@/components/BoundaryBanner';
import { ProvenanceStrip } from '@/components/ProvenanceStrip';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useUi } from '@/store/ui';
import ReactECharts from 'echarts-for-react';
import { useMemo, useState } from 'react';
import { buildHeatmapOption, iqrBar } from './heatmapOption';

type Candidate = Schema<'Candidate'>;

function SignedBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, (Math.abs(value) / max) * 50);
  const negative = value < 0;
  return (
    <span
      className="relative inline-block h-3 w-20 overflow-hidden rounded-sm bg-neutral-100"
      role="img"
      aria-label={`${value.toFixed(2)} (${negative ? 'reversal' : 'mimic'})`}
      title={`${value.toFixed(3)}`}
    >
      <span className="absolute top-0 bottom-0 left-1/2 w-px bg-neutral-400" />
      <span
        className={`absolute top-0 bottom-0 ${negative ? 'bg-teal-700' : 'bg-amber-600'}`}
        style={
          negative
            ? { right: '50%', width: `${pct}%` }
            : { left: '50%', width: `${pct}%` }
        }
      />
    </span>
  );
}

function CandidateRow({
  c,
  selected,
  iqrMin,
  iqrMax,
  onSelect,
}: {
  c: Candidate;
  selected: boolean;
  iqrMin: number;
  iqrMax: number;
  onSelect: () => void;
}) {
  const maxScore = 3;
  const bar = iqrBar(c.consensus_iqr[0], c.consensus_iqr[1], iqrMin, iqrMax);
  return (
    <tr
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect();
      }}
      tabIndex={0}
      aria-selected={selected}
      className={`cursor-pointer border-b border-neutral-100 tabular-nums hover:bg-teal-50/50 ${
        selected ? 'bg-teal-50' : ''
      } ${c.is_demo_candidate ? 'border-l-2 border-l-teal-700' : ''}`}
    >
      <td className="py-1.5 pr-2 pl-2 font-medium">{c.rank}</td>
      <td className="py-1.5 pr-2">
        {c.name}
        {c.is_demo_candidate && (
          <Badge variant="outline" className="ml-2 border-teal-600 text-teal-800">
            demo
          </Badge>
        )}
      </td>
      <td className="py-1.5 pr-2 font-semibold text-teal-900">{c.consensus.toFixed(2)}</td>
      <td className="py-1.5 pr-2">
        <span
          className="relative inline-block h-3 w-24 overflow-hidden rounded-sm bg-neutral-100"
          role="img"
          aria-label={`IQR ${c.consensus_iqr[0].toFixed(2)} to ${c.consensus_iqr[1].toFixed(2)}`}
          title={`IQR [${c.consensus_iqr[0].toFixed(2)}, ${c.consensus_iqr[1].toFixed(2)}]`}
        >
          <span
            className="absolute top-0 bottom-0 rounded-sm bg-teal-700/70"
            style={{ left: `${bar.left}%`, width: `${Math.max(4, bar.width)}%` }}
          />
        </span>
      </td>
      <td className="py-1.5 pr-2">
        <SignedBar value={c.scores.wtcs} max={maxScore} />
      </td>
      <td className="py-1.5 pr-2">
        <SignedBar value={c.scores.ks} max={maxScore} />
      </td>
      <td className="py-1.5 pr-2">
        <SignedBar value={c.scores.cosine} max={maxScore} />
      </td>
      <td className="py-1.5 pr-2">{c.n_ranking_contexts}</td>
      <td className="py-1.5 pr-2">
        {c.approval_status && c.approval_status.status !== 'unknown' && (
          <Badge variant="secondary">{c.approval_status.status}</Badge>
        )}
      </td>
      <td className="py-1.5 pr-2 text-neutral-500">{c.flags?.join(', ')}</td>
    </tr>
  );
}

export function RepurposingView() {
  const { data, isLoading, isError } = useCandidates(50);
  const { selectedCandidateId, selectCandidate, setStep } = useUi();
  const [showTop, setShowTop] = useState(12);

  const candidates = useMemo(() => data?.candidates.slice(0, showTop) ?? [], [data, showTop]);
  const iqrRange = useMemo(() => {
    const los = (data?.candidates ?? []).map((c) => c.consensus_iqr[0]);
    const his = (data?.candidates ?? []).map((c) => c.consensus_iqr[1]);
    return { min: Math.min(...los, 0), max: Math.max(...his, 0) };
  }, [data]);
  const heatOption = useMemo(
    () => (data ? buildHeatmapOption(candidates, [...MOCK_CELL_LINES]) : null),
    [data, candidates],
  );
  const perm = data?.permutation_control;

  return (
    <div className="flex h-full flex-col">
      <BoundaryBanner />
      <div className="flex-1 space-y-4 overflow-auto p-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h2 className="text-xl font-semibold">Repurposing candidates</h2>
          {data && (
            <p className="text-sm text-neutral-500">
              {data.n_ranked} compounds ranked · signature {data.signature}
            </p>
          )}
          {perm && (
            <p aria-label="Permutation control" className="text-sm tabular-nums">
              Permutation control:{' '}
              <span className={perm.passed ? 'font-medium text-teal-800' : 'font-medium text-red-700'}>
                {perm.passed ? 'passed' : 'failed'} (theta = {perm.theta?.toFixed(2)})
              </span>
            </p>
          )}
        </div>

        {isLoading && <Skeleton className="h-[300px] w-full" />}
        {isError && (
          <p role="alert" className="text-sm text-red-700">
            Could not load candidates.
          </p>
        )}
        {data && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Leaderboard — consensus (negative = reversal). Click a row for evidence.
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                      <th className="py-1 pr-2 pl-2 font-medium">Rank</th>
                      <th className="py-1 pr-2 font-medium">Name</th>
                      <th className="py-1 pr-2 font-medium">Consensus</th>
                      <th className="py-1 pr-2 font-medium">IQR</th>
                      <th className="py-1 pr-2 font-medium">WTCS</th>
                      <th className="py-1 pr-2 font-medium">KS</th>
                      <th className="py-1 pr-2 font-medium">Cos</th>
                      <th className="py-1 pr-2 font-medium">n ctx</th>
                      <th className="py-1 pr-2 font-medium">Approval</th>
                      <th className="py-1 pr-2 font-medium">Flags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {candidates.map((c) => (
                      <CandidateRow
                        key={c.id}
                        c={c}
                        selected={c.id === selectedCandidateId}
                        iqrMin={iqrRange.min}
                        iqrMax={iqrRange.max}
                        onSelect={() => {
                          selectCandidate(c.id);
                          setStep('evidence');
                        }}
                      />
                    ))}
                  </tbody>
                </table>
                <div className="mt-2 flex gap-2">
                  {[12, 25, 50].map((n) => (
                    <button
                      key={n}
                      onClick={() => setShowTop(n)}
                      aria-pressed={showTop === n}
                      className={`rounded border px-2 py-0.5 text-xs tabular-nums ${
                        showTop === n
                          ? 'border-teal-700 bg-teal-50 text-teal-900'
                          : 'border-neutral-300 text-neutral-600'
                      }`}
                    >
                      top {n}
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">
                  Connectivity heatmap — candidates × cell lines
                </CardTitle>
              </CardHeader>
              <CardContent>
                {heatOption && (
                  <div role="img" aria-label="Heatmap of reversal consensus by cell line. Negative values in teal indicate reversal.">
                    <ReactECharts
                      option={heatOption}
                      style={{ height: Math.max(260, candidates.length * 30 + 120) }}
                    />
                  </div>
                )}
                <p className="mt-1 text-xs font-medium text-teal-900">
                  Negative = reverses the AD pattern.
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>
      <ProvenanceStrip provenance={data?.provenance} />
    </div>
  );
}
