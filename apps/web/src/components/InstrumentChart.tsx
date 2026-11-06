import ReactECharts from 'echarts-for-react';
import type { ComponentProps } from 'react';

const theme = {
  textStyle: { color: '#a0b3ba', fontFamily: 'monospace' },
  categoryAxis: {
    axisLine: { lineStyle: { color: '#41565e' } },
    axisLabel: { color: '#a0b3ba' },
    splitLine: { lineStyle: { color: '#2a3a41' } },
  },
  valueAxis: {
    axisLine: { lineStyle: { color: '#41565e' } },
    axisLabel: { color: '#a0b3ba' },
    nameTextStyle: { color: '#a0b3ba' },
    splitLine: { lineStyle: { color: '#2a3a41' } },
  },
  legend: { textStyle: { color: '#a0b3ba' } },
  tooltip: { backgroundColor: '#182125', borderColor: '#41565e', textStyle: { color: '#e6edee' } },
};

/** Shared instrument chart contrast and reduced-motion preference. */
export function InstrumentChart(props: ComponentProps<typeof ReactECharts>) {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return <ReactECharts {...props} theme={theme} option={{ ...props.option, ...(reducedMotion ? { animation: false } : {}) }} />;
}
