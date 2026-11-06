import ReactECharts from 'echarts-for-react';
import { useMemo, useState } from 'react';
import { buildVolcanoOption } from './volcanoOption';
import type { Schema } from '@/api/schema';

export function VolcanoPlot({ genes }: { genes: Schema<'GeneStat'>[] }) {
  // Animate only on first mount (the demo opens on this view).
  const [animate] = useState(true);
  const option = useMemo(() => buildVolcanoOption(genes, animate), [genes, animate]);
  return (
    <div role="img" aria-label={`Volcano plot of ${genes.length} genes. Negative x means lower in AD.`}>
      <ReactECharts option={option} style={{ height: 420 }} opts={{ renderer: 'canvas' }} />
    </div>
  );
}
