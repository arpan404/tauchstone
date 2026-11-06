import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import fixture from './fixture.json';

describe('single-cell mock fixture', () => {
  it('matches the contract fixture', () => {
    const contract = JSON.parse(
      readFileSync(resolve(process.cwd(), '../../contracts/fixtures/getSingleCellExploratory.json'), 'utf8'),
    );
    expect(fixture).toEqual(contract);
  });
});
