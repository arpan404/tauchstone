import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { CellSimulation } from './CellSimulation';

afterEach(cleanup);

describe('CellSimulation', () => {
  it('renders a canvas in idle state', () => {
    const { getByTestId } = render(<CellSimulation state="idle" />);
    const el = getByTestId('cell-simulation');
    expect(el.tagName).toBe('CANVAS');
    expect(el.getAttribute('data-state')).toBe('idle');
  });

  it('reflects scoring state with progress and custom height', () => {
    const { getByTestId } = render(
      <CellSimulation state="scoring" progress={0.5} height={200} />,
    );
    const el = getByTestId('cell-simulation') as HTMLCanvasElement;
    expect(el.getAttribute('data-state')).toBe('scoring');
    expect(el.style.height).toBe('200px');
  });

  it('renders done state without crashing', () => {
    const { getByTestId } = render(<CellSimulation state="done" progress={1} />);
    expect(getByTestId('cell-simulation').getAttribute('data-state')).toBe('done');
  });
});
