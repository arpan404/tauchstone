import type { components } from '../schema';
import { getMockCandidates } from './candidates';
import { MOCK_SEED, roundTo, streamFor } from './prng';

type EvidenceCard = components['schemas']['EvidenceCard'];
type Target = components['schemas']['Target'];

const BOUNDARY = 'Research hypothesis only. Not a treatment recommendation. Gene expression reversal does not establish efficacy, safety, dosing, brain exposure or clinical benefit.' as const;

const TARGET_POOL = [
  { symbol: 'GSK3B', uniprot: 'P49841', entrez_id: '2932', ensembl_id: 'ENSG00000082701' },
  { symbol: 'CDK5', uniprot: 'Q00535', entrez_id: '1020', ensembl_id: 'ENSG00000164885' },
  { symbol: 'MAPK1', uniprot: 'P28482', entrez_id: '5594', ensembl_id: 'ENSG00000100030' },
  { symbol: 'DRD2', uniprot: 'P14416', entrez_id: '1813', ensembl_id: 'ENSG00000149295' },
  { symbol: 'HTR2A', uniprot: 'P28223', entrez_id: '3356', ensembl_id: 'ENSG00000102468' },
  { symbol: 'ACHE', uniprot: 'P22303', entrez_id: '43', ensembl_id: 'ENSG00000087085' },
] as const;

const BRAIN_CONTEXTS = [
  { context: 'cerebral cortex', kind: 'region' },
  { context: 'hippocampus', kind: 'region' },
  { context: 'cerebellum', kind: 'region' },
  { context: 'neuron', kind: 'cell_type' },
  { context: 'microglia', kind: 'cell_type' },
  { context: 'astrocyte', kind: 'cell_type' },
] as const;

const ACTIONS = ['INHIBITOR', 'ANTAGONIST', 'AGONIST', 'MODULATOR'] as const;

export function getMockEvidence(candidateId: string): EvidenceCard {
  const candidate = getMockCandidates().candidates.find((c) => c.id === candidateId);
  if (!candidate) throw new Error(`Mock candidate not found: ${candidateId}`);
  const rng = streamFor(`evidence:${candidateId}`);

  const t1 = TARGET_POOL[Math.floor(rng() * TARGET_POOL.length)];
  let t2 = TARGET_POOL[Math.floor(rng() * TARGET_POOL.length)];
  if (t2.symbol === t1.symbol) t2 = TARGET_POOL[(TARGET_POOL.indexOf(t1) + 3) % TARGET_POOL.length];

  const makeTarget = (t: (typeof TARGET_POOL)[number], i: number): Target => ({
    symbol: t.symbol,
    uniprot: t.uniprot,
    entrez_id: t.entrez_id,
    ensembl_id: t.ensembl_id,
    action_type: ACTIONS[Math.floor(rng() * ACTIONS.length)],
    brain_expression: BRAIN_CONTEXTS.map((b) => ({
      context: b.context,
      kind: b.kind,
      ntpm: roundTo(1 + rng() * 60, 1),
    })),
    ad_association_score: roundTo(0.15 + rng() * 0.7, 3),
    sources: [
      { label: `ChEMBL target ${t.symbol} (mock)`, url: 'https://www.ebi.ac.uk/chembl/' },
      {
        label: `Open Targets ${t.symbol} (mock)`,
        url: 'https://platform.opentargets.org/',
      },
    ],
    ...(i === 0 ? {} : {}),
  });

  const hasStructure = candidate.rank % 2 === 1;
  const approvalStatus = candidate.approval_status ?? { status: 'unknown' as const };

  return {
    candidate_id: candidate.id,
    name: candidate.name,
    chembl_id: `CHEMBL${String(100000 + candidate.rank * 137)}`,
    mechanism: candidate.rank % 3 === 0 ? 'Kinase inhibitor scaffold (mock annotation)' : null,
    targets: [makeTarget(t1, 0), makeTarget(t2, 1)],
    approval_status: approvalStatus,
    brain_exposure: {
      // Before an attack only the predicted level is available (contract decision #7).
      level: 'predicted',
      summary: `Predicted CNS MPO score ${roundTo(2.5 + rng() * 2.5, 2)} of 6 (physchem only; no measured CNS data shown before validation).`,
      sources: [{ label: 'CNS MPO prediction (mock)', url: 'https://www.ebi.ac.uk/chembl/' }],
    },
    structure: hasStructure
      ? {
          pdb_id: '1CRN',
          uniprot: t1.uniprot,
          method: 'X-ray diffraction',
          resolution_angstrom: 1.5,
          url: '/mock-structures/1crn.cif',
          note: 'Target context only. Not evidence that the drug binds this structure.',
        }
      : null,
    boundary: BOUNDARY,
    provenance: {
      dataset_accession: ['GSE132903', 'ChEMBL', 'Open Targets', 'HPA'],
      processing_version: 'mock-0.1.0',
      git_commit: 'mock',
      timestamp: '2026-11-05T00:00:00Z',
      random_seed: MOCK_SEED,
    },
  };
}
