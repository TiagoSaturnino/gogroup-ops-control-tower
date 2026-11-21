import type { runEngine } from '@/lib/engine';
import type { Action, AuditRecord, OrderState } from '@/lib/actions';

export type Dashboard = ReturnType<typeof runEngine> & { orderStates: Record<string, OrderState> };
export type EnrichedOrder = Dashboard['orders'][number];
export type ActionHistory = Action & { modelo?: string };
export type { Action, AuditRecord, OrderState };
