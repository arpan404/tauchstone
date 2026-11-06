import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { isMockProvenance } from './types';
import { MockRibbon } from '../components/MockRibbon';

describe('mock-data integrity signal', () => {
  it('flags MOCK accessions (exact or containing)', () => {
    expect(isMockProvenance({ dataset_accession: 'MOCK' })).toBe(true);
    expect(isMockProvenance({ dataset_accession: ['GSE132903', 'MOCK'] })).toBe(true);
    expect(isMockProvenance({ dataset_accession: 'mock-world-v1' })).toBe(true);
  });

  it('flags synthetic accessions', () => {
    expect(isMockProvenance({ dataset_accession: 'SYN' })).toBe(true);
    expect(isMockProvenance({ dataset_accession: 'synthetic-lincs-v2' })).toBe(true);
  });

  it('passes real accessions and empty provenance', () => {
    expect(isMockProvenance({ dataset_accession: 'GSE132903' })).toBe(false);
    expect(isMockProvenance({ dataset_accession: ['GSE132903', 'ChEMBL'] })).toBe(false);
    expect(isMockProvenance(null)).toBe(false);
    expect(isMockProvenance(undefined)).toBe(false);
  });

  it('renders an unmissable ribbon when mock, nothing when real', () => {
    const { rerender } = render(<MockRibbon show={true} />);
    const banner = screen.getByRole('status', { name: 'Mock data warning' });
    expect(banner.textContent).toMatch(/not real results/i);
    rerender(<MockRibbon show={false} />);
    expect(screen.queryByRole('status', { name: 'Mock data warning' })).toBeNull();
  });
});
