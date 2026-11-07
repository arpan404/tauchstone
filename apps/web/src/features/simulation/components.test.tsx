import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CellSimulation } from './CellSimulation';
import { installFakeCanvas, installManualRaf, setReducedMotion } from './fakeCanvas';
import { TestCellGlyph, type TestCellState } from './TestCellGlyph';

beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); setReducedMotion(false); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('CellSimulation', () => {
  it('draws frames in every state', () => {
    const { calls } = installFakeCanvas();
    const raf = installManualRaf();
    const { rerender } = render(<CellSimulation state="idle" />);
    act(() => raf.step(5));
    const idleCalls = calls.length;
    expect(idleCalls).toBeGreaterThan(50);
    rerender(<CellSimulation state="scoring" progress={0.5} />);
    act(() => raf.step(30));
    rerender(<CellSimulation state="done" />);
    act(() => raf.step(5));
    expect(calls.length).toBeGreaterThan(idleCalls);
    expect(screen.getByTestId('cell-simulation').dataset.state).toBe('done');
  });

  it('respects the height prop', () => {
    installFakeCanvas();
    installManualRaf();
    render(<CellSimulation state="idle" height={180} />);
    expect(screen.getByTestId('cell-simulation').style.height).toBe('180px');
  });

  it('renders one static frame and no loop with reduced motion', () => {
    setReducedMotion(true);
    const { calls } = installFakeCanvas();
    const raf = installManualRaf();
    render(<CellSimulation state="done" />);
    expect(calls.length).toBeGreaterThan(50);
    expect(raf.pending()).toBe(0);
  });

  it('survives without a 2D context', () => {
    installManualRaf();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    render(<CellSimulation state="scoring" progress={0.2} />);
    expect(screen.getByTestId('cell-simulation')).toBeTruthy();
  });
});

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
