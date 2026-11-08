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

/** Light-mode literals used by chart option builders, mapped to the dark palette. */
function darkMap(): Record<string, string> {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string) => css.getPropertyValue(n).trim();
  return {
    '#687182': v('--ink-3'), '#6b7080': v('--ink-3'), '#525252': v('--ink-3'),
    '#e5e8ed': v('--line'), '#e2e4e9': v('--line'), '#e6e2d8': v('--line'),
    '#1558b8': v('--primary'), '#fdfdfe': v('--surface'), '#ffffff': v('--surface'), '#fefefe': v('--surface'),
  };
}
function recolor<T>(o: T, map: Record<string, string>): T {
  if (typeof o === 'string') return (map[o.toLowerCase()] ?? o) as T;
  if (Array.isArray(o)) return (o.length > 2000 ? o : o.map((x) => recolor(x, map))) as T;
  if (o && typeof o === 'object' && Object.getPrototypeOf(o) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(o)) out[k] = k === 'data' && Array.isArray(x) && x.length > 2000 ? x : recolor(x, map);
    return out as T;
  }
  return o;
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
  const base = useMemo(() => (dark ? recolor(props.option, darkMap()) : props.option), [props.option, dark]);
  const option = { ...base, textStyle: { ...base.textStyle, color: theme.textStyle.color }, legend: { ...base.legend, textStyle: { ...base.legend?.textStyle, color: theme.textStyle.color } }, ...(reducedMotion ? { animation: false } : {}) };
  return <ReactECharts {...props} theme={theme} option={option} />;
}
