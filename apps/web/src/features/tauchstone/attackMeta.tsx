import type { ReactNode } from 'react';
import {
  BrainIcon, ChartPieSliceIcon, CubeIcon, QuestionIcon, SealCheckIcon, TestTubeIcon, UsersThreeIcon, WarningIcon,
} from '@phosphor-icons/react';
import type { Schema } from '@/api/types';

type Verdict = Schema<'Verdict'>;

/** Verdict names are verbatim from AGENTS.md. */
export const VERDICT_TEXT: Record<Verdict, string> = {
  INSUFFICIENT_EVIDENCE: 'INSUFFICIENT EVIDENCE',
  FRAGILE_CONTEXT_DEPENDENT: 'FRAGILE / CONTEXT-DEPENDENT',
  SUPPORTED_SO_FAR: 'SUPPORTED SO FAR',
};
export const VERDICT_TONE: Record<Verdict, 'neutral' | 'bad' | 'ok'> = {
  INSUFFICIENT_EVIDENCE: 'neutral',
  FRAGILE_CONTEXT_DEPENDENT: 'bad',
  SUPPORTED_SO_FAR: 'ok',
};
export const VERDICT_ICON: Record<Verdict, ReactNode> = {
  INSUFFICIENT_EVIDENCE: <QuestionIcon weight="bold" />,
  FRAGILE_CONTEXT_DEPENDENT: <WarningIcon weight="bold" />,
  SUPPORTED_SO_FAR: <SealCheckIcon weight="bold" />,
};

const TYPE_ICON: Record<string, ReactNode> = {
  held_out_cohort: <UsersThreeIcon />,
  composition_adjusted: <ChartPieSliceIcon />,
  lincs_context: <TestTubeIcon />,
  brain_exposure: <BrainIcon />,
  cell_type: <CubeIcon />,
};
export const typeIcon = (type: string) => TYPE_ICON[type] ?? <CubeIcon />;

/** Sealed labels spell micromolar as 'uM'; display it properly without touching the data. */
export const unit = (label: string) => label.replace(/(\d)\s*uM\b/g, '$1 µM');
