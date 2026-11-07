import { describe, expect, it, afterEach } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MoleculeViewer, type Molecule3D } from './MoleculeViewer';

afterEach(cleanup);

const WATER: Molecule3D = {
  formula: 'H2O',
  atoms: [
    { el: 'O', x: 0, y: 0, z: 0 },
    { el: 'H', x: 0.76, y: 0.59, z: 0 },
    { el: 'H', x: -0.76, y: 0.59, z: 0 },
  ],
  bonds: [
    [0, 1, 1],
    [0, 2, 1],
  ],
};

describe('MoleculeViewer', () => {
  it('renders an empty state with no text when molecule is null', () => {
    const { getByTestId, queryByTestId } = render(<MoleculeViewer molecule={null} />);
    expect(getByTestId('molecule-empty')).toBeTruthy();
    expect(queryByTestId('molecule-canvas')).toBeNull();
    expect(getByTestId('molecule-empty').textContent).toBe('');
  });

  it('renders canvas and formula label for a real molecule', () => {
    const { getByTestId } = render(<MoleculeViewer molecule={WATER} />);
    expect(getByTestId('molecule-canvas')).toBeTruthy();
    expect(getByTestId('molecule-formula').textContent).toBe('H2O');
  });
});
