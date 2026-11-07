import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeCanvas, installManualRaf, setReducedMotion } from '../simulation/fakeCanvas';
import piperacillin from './__fixtures__/piperacillin.BRD-K86873305.json';
import type { Molecule3D } from './geometry';
import { MoleculeViewer } from './MoleculeViewer';

const pip = piperacillin as Molecule3D;
beforeEach(() => { vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); setReducedMotion(false); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('MoleculeViewer', () => {
  it('draws one ball per atom and shows the formula', () => {
    const { calls } = installFakeCanvas();
    const raf = installManualRaf();
    render(<MoleculeViewer molecule={pip} height={240} />);
    act(() => raf.step(1));
    const before = calls.filter((c) => c === 'arc').length;
    act(() => raf.step(1));
    // 36 atom balls per frame (the empty-state rings are not drawn when a molecule is present)
    expect(calls.filter((c) => c === 'arc').length - before).toBe(36);
    expect(screen.getByTestId('molecule-formula').textContent).toBe('C23H27N5O7S');
    expect(screen.getByTestId('molecule-viewer').style.height).toBe('240px');
  });

  it('shows an empty state without text for null', () => {
    installFakeCanvas();
    installManualRaf();
    render(<MoleculeViewer molecule={null} />);
    expect(screen.getByTestId('molecule-viewer').dataset.state).toBe('empty');
    expect(screen.queryByTestId('molecule-formula')).toBeNull();
    expect(screen.getByTestId('molecule-viewer').textContent).toBe('');
  });

  it('treats a malformed molecule as empty', () => {
    installFakeCanvas();
    installManualRaf();
    render(<MoleculeViewer molecule={{ formula: 'X', atoms: [], bonds: [] }} />);
    expect(screen.getByTestId('molecule-viewer').dataset.state).toBe('empty');
  });

  it('handles drag, wheel and keys without errors and redraws', () => {
    setReducedMotion(true);
    const { calls } = installFakeCanvas();
    installManualRaf();
    render(<MoleculeViewer molecule={pip} />);
    const canvas = screen.getByRole('img');
    const n0 = calls.length;
    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 40, clientY: 25 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    fireEvent.wheel(canvas, { deltaY: -120 });
    fireEvent.keyDown(canvas, { key: 'ArrowLeft' });
    expect(calls.length).toBeGreaterThan(n0);
  });

  it('does not auto-rotate with reduced motion', () => {
    setReducedMotion(true);
    installFakeCanvas();
    const raf = installManualRaf();
    render(<MoleculeViewer molecule={pip} />);
    expect(raf.pending()).toBe(0);
  });
});
