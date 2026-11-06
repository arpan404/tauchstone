import type { Schema } from '@/api/types';

type Session = Schema<'AttackSession'>;

export function remainingTests(session: Pick<Session, 'contexts' | 'budget_remaining'>) {
  return Math.min(session.budget_remaining, session.contexts.filter(context => context.status === 'hidden').length);
}

