import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { TestCellGlyph, type TestCellGlyphState } from './TestCellGlyph';

afterEach(cleanup);

const STATES: TestCellGlyphState[] = ['pending', 'next', 'running', 'survive', 'fail'];

describe('TestCellGlyph', () => {
  it.each(STATES)('renders state %s as an SVG blob', (state) => {
    const { getByTestId } = render(<TestCellGlyph state={state} />);
    const el = getByTestId('test-cell-glyph');
    expect(el.tagName).toBe('svg');
    expect(el.getAttribute('data-state')).toBe(state);
  });

  it('respects custom size', () => {
    const { getByTestId } = render(<TestCellGlyph state="survive" size={64} />);
    const el = getByTestId('test-cell-glyph');
    expect(el.getAttribute('width')).toBe('64');
    expect(el.getAttribute('height')).toBe('64');
  });
});
