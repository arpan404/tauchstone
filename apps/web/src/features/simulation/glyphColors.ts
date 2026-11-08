export type TestCellState = 'pending' | 'next' | 'running' | 'survive' | 'fail';

export const GLYPH_COLORS: Record<TestCellState, string> = {
  pending: '#a3a0a8',
  next: '#1558b8',
  running: '#f29b38',
  survive: '#12a36a',
  fail: '#ef5b4f',
};
