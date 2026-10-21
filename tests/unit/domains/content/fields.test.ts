import { describe, expect, it } from 'vitest';
import { DESTINATION_KINDS } from '@/domains/tourism/destinations';
import { requiresHumanReview } from '@/domains/editorial/publication';
import {
  CONTENT_FIELDS,
  FIELD_KEYS,
  FIELD_GROUPS,
  appliesTo,
  fieldsFor,
  getField,
  isFieldKey,
} from '@/domains/content/fields';
import { addDays, daysBetween, dayOf, isIsoDate, isIsoInstant } from '@/domains/content/dates';

describe('registro de campos', () => {
  it('las claves son únicas y siguen el patrón grupo.nombre con un grupo conocido', () => {
    expect(new Set(FIELD_KEYS).size).toBe(FIELD_KEYS.length);
    for (const f of CONTENT_FIELDS) {
      expect(f.key).toMatch(/^[a-z]+\.[a-z0-9_]+$/);
      expect(FIELD_GROUPS).toContain(f.key.split('.')[0]);
      expect(f.key.split('.')[0]).toBe(f.group);
    }
  });

  it('ningún campo se respalda con evidencia comunitaria o comercial', () => {
    for (const f of CONTENT_FIELDS) {
      expect(f.evidence.classes).not.toContain('community');
      expect(f.evidence.classes).not.toContain('commercial');
      expect(f.evidence.classes.length).toBeGreaterThan(0);
      expect(f.evidence.minCount).toBeGreaterThanOrEqual(1);
      expect(f.evidence.maxAgeDays).toBeGreaterThan(0);
    }
  });

  it('lo sensible (restricciones, seguridad, legal) exige fuente oficial/institucional/científica, no solo una reseña editorial', () => {
    for (const f of CONTENT_FIELDS.filter((x) => requiresHumanReview(x.sensitivity))) {
      expect(f.evidence.classes).not.toContain('editorial_review');
      expect(f.maxValidityDays).not.toBeNull();
    }
  });

  it('lo que caduca no se verifica con fuentes más viejas que su vigencia', () => {
    for (const f of CONTENT_FIELDS) {
      if (f.maxValidityDays !== null) {
        expect(f.evidence.maxAgeDays).toBeGreaterThanOrEqual(f.maxValidityDays > 365 ? 365 : 1);
      }
    }
  });

  it('un campo de cantidad declara su unidad; uno de texto, no', () => {
    for (const f of CONTENT_FIELDS) {
      if (f.valueKind === 'quantity') expect(f.unit).toBeDefined();
      else expect('unit' in f).toBe(false);
    }
  });

  it('la elevación solo aplica a volcanes y las demás a todos los tipos', () => {
    expect(fieldsFor('volcano').map((f) => f.key)).toContain('facts.elevation_m');
    for (const kind of DESTINATION_KINDS.filter((k) => k !== 'volcano')) {
      expect(fieldsFor(kind).map((f) => f.key)).not.toContain('facts.elevation_m');
    }
    const elevation = getField('facts.elevation_m');
    expect(elevation && appliesTo(elevation, 'island')).toBe(false);
  });

  it('getField / isFieldKey rechazan claves desconocidas, incluidas las hostiles', () => {
    for (const bad of [
      '',
      'overview',
      '__proto__',
      'constructor',
      'overview.summary ',
      'OVERVIEW.SUMMARY',
    ]) {
      expect(getField(bad)).toBeUndefined();
      expect(isFieldKey(bad)).toBe(false);
    }
    expect(isFieldKey('overview.summary')).toBe(true);
  });
});

describe('fechas', () => {
  it.each([
    '2026-02-31',
    '2026-13-01',
    '2026-00-10',
    '2026-1-1',
    '26-01-01',
    '',
    '2026-01-01T00:00:00Z',
  ])('rechaza «%s» como fecha', (v) => {
    expect(isIsoDate(v)).toBe(false);
  });

  it('acepta el 29 de febrero solo en año bisiesto', () => {
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate('2027-02-29')).toBe(false);
    expect(isIsoDate('2100-02-29')).toBe(false);
    expect(isIsoDate('2000-02-29')).toBe(true);
  });

  it('un instante exige hora y zona', () => {
    expect(isIsoInstant('2026-10-01T15:00:00Z')).toBe(true);
    expect(isIsoInstant('2026-10-01T15:00:00-05:00')).toBe(true);
    expect(isIsoInstant('2026-10-01T15:00:00')).toBe(false);
    expect(isIsoInstant('2026-10-01')).toBe(false);
    expect(isIsoInstant('2026-02-31T15:00:00Z')).toBe(false);
    expect(isIsoInstant('ayer')).toBe(false);
  });

  it('daysBetween cuenta días de calendario, con signo y a través de años', () => {
    expect(daysBetween('2026-10-01', '2026-10-21')).toBe(20);
    expect(daysBetween('2026-10-21', '2026-10-01')).toBe(-20);
    expect(daysBetween('2027-12-31', '2028-03-01')).toBe(61);
    expect(daysBetween('2026-10-21', '2026-10-21')).toBe(0);
    expect(daysBetween('2026-02-31', '2026-03-01')).toBeNull();
    expect(daysBetween('nada', '2026-03-01')).toBeNull();
  });

  it('dayOf y addDays no convierten de zona y cruzan fin de mes y de año', () => {
    expect(dayOf('2026-10-01T23:59:59-05:00')).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-10-21', -21)).toBe('2026-09-30');
    expect(addDays('basura', 1)).toBeNull();
  });
});
