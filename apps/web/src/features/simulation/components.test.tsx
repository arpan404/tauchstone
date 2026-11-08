import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setReducedMotion } from './fakeCanvas';
import { TestCellGlyph, type TestCellState } from './TestCellGlyph';

beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); setReducedMotion(false); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('TestCellGlyph', () => {
  const states: TestCellState[] = ['pending', 'next', 'running', 'survive', 'fail'];
  it.each(states)('renders %s without text', (s) => {
    render(<TestCellGlyph state={s} size={32} />);
    const svg = screen.getByTestId('test-cell-glyph');
    expect(svg.getAttribute('data-state')).toBe(s);
    expect(svg.getAttribute('width')).toBe('32');
    expect(svg.querySelector('text')).toBeNull();
  });
  it('gives each glyph its own gradient id', () => {
    render(<><TestCellGlyph state="next" /><TestCellGlyph state="fail" /></>);
    const ids = [...document.querySelectorAll('radialGradient')].map((g) => g.id);
    expect(new Set(ids).size).toBe(2);
  });
});
