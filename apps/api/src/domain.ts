import { createHash } from 'node:crypto';
import type { CycleStatus } from '@pathey/types';

export const addDays = (date: Date | string, days: number) => new Date(new Date(date).getTime() + days * 86_400_000);
export const calculateExpiry = (publicationAt: Date | string, days: number) => addDays(publicationAt, days);
export const calculateDisplayEnd = (publicationAt: Date | string) => addDays(publicationAt, 15);
export const isExpired = (expiresAt: Date | string, now = new Date()) => now.getTime() >= new Date(expiresAt).getTime();
const transitions: Record<CycleStatus, CycleStatus[]> = { draft: ['scheduled','published'], scheduled: ['draft','published','expired'], published: ['expired'], expired: ['purged'], purged: [] };
export const canTransition = (from: CycleStatus, to: CycleStatus) => transitions[from].includes(to);
export const assertRanks = (ranks: number[]) => {
  if (ranks.some((rank) => !Number.isInteger(rank) || rank < 1 || rank > 10)) throw new Error('INVALID_RANK');
  if (new Set(ranks).size !== ranks.length) throw new Error('DUPLICATE_RANK');
};
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
export const sanitizeFilename = (value: string) => value.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^[.-]+|[.-]+$/g, '').slice(0, 90) || 'certificate';
export const csvSafe = (value: string) => /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
export const publicCycleState = (cycle: { status: CycleStatus; publicationAt: string; expiresAt: string }, now = new Date()) => {
  if (cycle.status === 'purged') return 'purged';
  if (cycle.status !== 'published') return new Date(cycle.publicationAt) > now ? 'not_open' : 'not_published';
  if (new Date(cycle.publicationAt) > now) return 'not_open';
  return isExpired(cycle.expiresAt, now) ? 'expired' : 'open';
};
