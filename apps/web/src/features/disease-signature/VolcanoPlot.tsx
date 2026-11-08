import { InstrumentChart } from '@/components/InstrumentChart';
import { useIsDark } from '@/app/theme';
import { useMemo, useState } from 'react';
import { buildVolcanoOption } from './volcanoOption';
import type { Schema } from '@/api/types';

type Gene = Schema<'GeneStat'>;

export function VolcanoPlot({
  genes,
  highlight = [],
  focusId = null,
  height = 420,
  onPick,
}: {
  genes: Gene[];
  highlight?: Gene[];
  focusId?: string | null;
  height?: number;
  /** Called with the gene symbol when a point is clicked. */
  onPick?: (symbol: string) => void;
}) {
  // Animate only on first mount; later updates (search highlights, theme) redraw instantly.
  const [animate] = useState(true);
  const dark = useIsDark();
  const option = useMemo(() => {
    void dark; // a theme switch re-reads the colour tokens
    return buildVolcanoOption(genes, animate, highlight, focusId);
  }, [genes, animate, highlight, focusId, dark]);
  const events = useMemo(
    () => ({ click: (p: { data?: { gene?: string } }) => p.data?.gene && onPick?.(p.data.gene) }),
    [onPick],
  );
  const named = highlight.length ? ` Highlighted: ${highlight.map((g) => g.symbol).join(', ')}.` : '';
  return (
    <div role="img" aria-label={`Volcano plot of ${genes.length} genes. Negative x means lower in Alzheimer's.${named}`}>
      <InstrumentChart option={option} style={{ width: '100%', height }} opts={{ renderer: 'canvas' }} onEvents={events} />
    </div>
  );
}
