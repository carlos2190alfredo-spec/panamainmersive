import { describe, expect, it } from 'vitest';
import { getTodayIsoDate } from '@/lib/today';

describe('día de hoy en Panamá', () => {
  it('es el día calendario de America/Panama, no el UTC', () => {
    // 03:00 UTC del día 21 = 22:00 del día 20 en Panamá (UTC−5).
    expect(getTodayIsoDate(new Date('2026-10-21T03:00:00Z'))).toBe('2026-10-20');
  });

  it('a las 05:00 UTC ya es el día siguiente en Panamá (medianoche local)', () => {
    expect(getTodayIsoDate(new Date('2026-10-21T04:59:59Z'))).toBe('2026-10-20');
    expect(getTodayIsoDate(new Date('2026-10-21T05:00:00Z'))).toBe('2026-10-21');
  });

  it('formato AAAA-MM-DD', () => {
    expect(getTodayIsoDate(new Date('2027-01-05T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
