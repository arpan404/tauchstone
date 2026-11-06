import { useCandidates, useMockStatus } from '@/api/hooks';
import type { Schema } from '@/api/types';
import { BoundaryBanner } from '@/components/BoundaryBanner';
import { MockRibbon } from '@/components/MockRibbon';
import { ProvenanceStrip } from '@/components/ProvenanceStrip';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useUi } from '@/store/ui';
import { useMemo, useState } from 'react';
import { iqrBar } from './heatmapOption';

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
      role="button"
      tabIndex={0}
      aria-label={`Select ${c.name}, rank ${c.rank}, consensus ${c.consensus.toFixed(2)}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
      aria-selected={selected}
      className={`cursor-pointer border-b border-neutral-100 tabular-nums hover:bg-teal-50/50 focus-visible:bg-teal-50/50 focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:ring-inset focus-visible:outline-none ${
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
  const mockData = useMockStatus(data?.provenance);
  const { selectedCandidateId, selectCandidate, setStep } = useUi();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('rank');
  const [negativeOnly, setNegativeOnly] = useState(false);
  const [compared, setCompared] = useState<string[]>([]);
  const selected = data?.candidates.find(c => c.id === selectedCandidateId);

  const candidates = useMemo(() => (data?.candidates ?? []).filter(c =>
    (c.name.toLowerCase().includes(query.trim().toLowerCase()) || c.id.toLowerCase().includes(query.trim().toLowerCase())) &&
    (!negativeOnly || c.consensus < 0)
  ).slice().sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'contexts' ? b.n_ranking_contexts - a.n_ranking_contexts || a.rank - b.rank : sort === 'consensus' ? a.consensus - b.consensus || a.rank - b.rank : a.rank - b.rank), [data, query, sort, negativeOnly]);
  const iqrRange = useMemo(() => {
    const los = (data?.candidates ?? []).map((c) => c.consensus_iqr[0]);
    const his = (data?.candidates ?? []).map((c) => c.consensus_iqr[1]);
    return { min: Math.min(...los, 0), max: Math.max(...his, 0) };
  }, [data]);
  const perm = data?.permutation_control;

  return (
    <div className="flex h-full flex-col">
      <BoundaryBanner />
      <MockRibbon show={mockData} />
      <div className="flex-1 space-y-4 overflow-auto p-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
          <h2 className="text-xl font-semibold">Repurposing candidates</h2>
          {data && (
            <p className="text-sm text-neutral-500">
              {data.n_ranked} compounds ranked · signature {data.signature}
            </p>
          )}
          {perm && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  aria-label={`Permutation control: ${perm.passed ? 'passed' : 'top-20 not all significant (gate: all 20 at p < 0.05)'}`}
                  className="rounded-sm text-sm font-medium focus-visible:ring-2 focus-visible:ring-teal-700 focus-visible:outline-none"
                >
                  <span className="tabular-nums">
                    Permutation control:{' '}
                    <span className={perm.passed ? 'text-teal-800' : 'text-amber-800'}>
                      {perm.passed
                        ? 'passed'
                        : 'top-20 not all significant (gate: all 20 at p < 0.05)'}
                    </span>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  The disease labels are shuffled and the ranking is recomputed (
                  {perm.n_permutations ?? 200} permutations). The gate passes only if all top-20
                  compounds beat the shuffled null at p &lt; 0.05.
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
                  Discovery ranking · negative consensus = reversal. Select a row to inspect.
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <div className="mb-4 flex flex-wrap items-center gap-3">
                  <label>Search name or ID <input className="rounded border p-2" value={query} onChange={e => setQuery(e.target.value)} /></label>
                  <label>Sort <select className="rounded border p-2" value={sort} onChange={e => setSort(e.target.value)}>
                    <option value="rank">Discovery rank</option><option value="consensus">Consensus ascending</option><option value="name">Name</option><option value="contexts">Ranking contexts descending</option>
                  </select></label>
                  <label><input type="checkbox" checked={negativeOnly} onChange={e => setNegativeOnly(e.target.checked)} /> Negative consensus only</label>
                  <button onClick={() => { setQuery(''); setNegativeOnly(false); setSort('rank'); }}>Clear controls</button>
                  <span role="status">{candidates.length} of {data.candidates.length} loaded · {data.n_ranked} ranked</span>
                </div>
                <p className="mb-3 text-xs">Filters use discovery ranking fields only. AD minus control; negative drug scores indicate reversal.</p>
                {candidates.length === 0 && <p>No candidates match these controls.</p>}
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

                        }}
                      />
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {selected && <Card>
              <CardHeader><CardTitle>{selected.name}</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p>ID {selected.id} · Discovery rank {selected.rank} · Consensus {selected.consensus.toFixed(3)}</p>
                <p>IQR {selected.consensus_iqr.join(' to ')} · {selected.n_ranking_contexts} ranking contexts</p>
                <p>WTCS {selected.scores.wtcs} · KS {selected.scores.ks} · Cosine {selected.scores.cosine}</p>
                <div className="flex flex-wrap gap-4">
                  <button onClick={() => setStep('evidence')}>Evidence</button>
                  <button onClick={() => setStep('attack')}>Experiments</button>
                  <button disabled={!compared.includes(selected.id) && compared.length >= 3} onClick={() => setCompared(ids => ids.includes(selected.id) ? ids.filter(id => id !== selected.id) : [...ids, selected.id])}>{compared.includes(selected.id) ? 'Remove from comparison' : 'Add to comparison'}</button>
                </div>
              </CardContent>
            </Card>}
            {compared.length > 0 && <Card><CardHeader><CardTitle>Discovery comparison ({compared.length}/3)</CardTitle></CardHeader><CardContent>
              <button onClick={() => setCompared([])}>Clear comparison</button>
              <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{['Candidate', 'Rank', 'Consensus', 'IQR', 'WTCS', 'KS', 'Cosine', 'Contexts', ''].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>{compared.map(id => data.candidates.find(c => c.id === id)).filter((c): c is Candidate => !!c).map(c => <tr key={c.id}><td>{c.name}</td><td>{c.rank}</td><td>{c.consensus}</td><td>{c.consensus_iqr.join(' to ')}</td><td>{c.scores.wtcs}</td><td>{c.scores.ks}</td><td>{c.scores.cosine}</td><td>{c.n_ranking_contexts}</td><td><button aria-label={`Remove ${c.name}`} onClick={() => setCompared(ids => ids.filter(id => id !== c.id))}>Remove</button></td></tr>)}</tbody></table></div>
            </CardContent></Card>}
          </>
        )}
      </div>
      <ProvenanceStrip provenance={data?.provenance} />
    </div>
  );
}
