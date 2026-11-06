import ReactECharts from 'echarts-for-react';
import { useMemo, useSyncExternalStore, type ComponentProps } from 'react';

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => observer.disconnect();
}
function subscribeMotion(onChange: () => void) {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/** Theme changes affect chart presentation only; scientific data and scales stay intact. */
export function InstrumentChart(props: ComponentProps<typeof ReactECharts>) {
  const dark = useSyncExternalStore(subscribeTheme, () => document.documentElement.classList.contains('dark'), () => false);
  const reducedMotion = useSyncExternalStore(subscribeMotion, () => window.matchMedia('(prefers-reduced-motion: reduce)').matches, () => false);
  const theme = useMemo(() => {
    const css = getComputedStyle(document.documentElement);
    const muted = css.getPropertyValue('--muted-foreground').trim() || (dark ? '#9ba6b8' : '#687182');
    const border = css.getPropertyValue('--border').trim() || (dark ? '#323947' : '#e5e8ed');
    const axis = { axisLine: { lineStyle: { color: border } }, axisLabel: { color: muted }, nameTextStyle: { color: muted }, splitLine: { lineStyle: { color: border } } };
    return {
      textStyle: { color: muted, fontFamily: 'Geist Variable, sans-serif' },
      categoryAxis: axis,
      valueAxis: axis,
      legend: { textStyle: { color: muted } },
      tooltip: { backgroundColor: css.getPropertyValue('--popover').trim(), borderColor: border, textStyle: { color: css.getPropertyValue('--foreground').trim() } },
    };
  }, [dark]);
  const option = { ...props.option, textStyle: { ...props.option.textStyle, color: theme.textStyle.color }, legend: { ...props.option.legend, textStyle: { ...props.option.legend?.textStyle, color: theme.textStyle.color } }, ...(reducedMotion ? { animation: false } : {}) };
  return <ReactECharts {...props} theme={theme} option={option} />;
}
