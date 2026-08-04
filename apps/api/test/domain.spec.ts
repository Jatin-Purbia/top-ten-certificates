import { describe, expect, it } from 'vitest';
import { assertRanks, calculateExpiry, canTransition, isExpired, publicCycleState, sanitizeFilename } from '../src/domain.js';
describe('certificate domain',()=>{
  it('calculates expiry without locale or DST drift',()=>expect(calculateExpiry('2026-08-01T12:00:00.000Z',30).toISOString()).toBe('2026-08-31T12:00:00.000Z'));
  it('enforces irreversible cycle transitions',()=>{expect(canTransition('draft','published')).toBe(true);expect(canTransition('purged','published')).toBe(false);expect(canTransition('published','draft')).toBe(false)});
  it('validates unique Top 10 ranks',()=>{expect(()=>assertRanks([1,2,10])).not.toThrow();expect(()=>assertRanks([1,1])).toThrow('DUPLICATE_RANK');expect(()=>assertRanks([11])).toThrow('INVALID_RANK')});
  it('enforces expiry using server time',()=>{expect(isExpired('2026-01-01T00:00:00Z',new Date('2026-01-01T00:00:00Z'))).toBe(true);expect(publicCycleState({status:'published',publicationAt:'2025-01-01T00:00:00Z',expiresAt:'2025-02-01T00:00:00Z'},new Date('2025-02-01T00:00:00Z'))).toBe('expired')});
  it('sanitizes filenames',()=>expect(sanitizeFilename('../../A name: certificate')).toBe('A-name-certificate'));
});
