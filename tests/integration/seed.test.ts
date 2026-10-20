import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DESTINATIONS, resolveDestinationSlug } from '../../src/domains/tourism/destinations';
import { LOCALES } from '../../src/i18n/locales';
import { seedDestinations } from '../../scripts/db/seed-destinations';
import { createTestDb, seedPeople, type TestDb } from './helpers';

let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
  await seedPeople(db);
  await seedDestinations(db.owner);
});
afterAll(async () => {
  await db.close();
});

describe('el registro de destinos de la aplicación cumple el esquema real', () => {
  it('siembra los 9 destinos, 45 slugs y 45 traducciones sin violar ninguna restricción', async () => {
    const d = await db.owner.query<{ n: string }>('select count(*) as n from public.destinations');
    const s = await db.owner.query<{ n: string }>(
      'select count(*) as n from public.destination_slugs',
    );
    const t = await db.owner.query<{ n: string }>(
      'select count(*) as n from public.destination_translations',
    );
    expect([Number(d.rows[0]?.n), Number(s.rows[0]?.n), Number(t.rows[0]?.n)]).toEqual([9, 45, 45]);
  });

  it('es idempotente: sembrar de nuevo no duplica ni falla', async () => {
    await seedDestinations(db.owner);
    const d = await db.owner.query<{ n: string }>('select count(*) as n from public.destinations');
    expect(Number(d.rows[0]?.n)).toBe(9);
  });

  it('los destinos sembrados quedan en borrador: publicar es una decisión editorial', async () => {
    const { rows } = await db.owner.query<{ status: string }>(
      'select distinct status from public.destinations',
    );
    expect(rows.map((r) => r.status)).toEqual(['draft']);
  });

  it('ninguna traducción sembrada figura como revisada: una máquina nunca es revisora', async () => {
    const { rows } = await db.owner.query<{ translation_status: string; n: string }>(
      'select translation_status, count(*) as n from public.destination_translations group by 1 order by 1',
    );
    expect(rows.map((r) => r.translation_status).sort()).toEqual(['draft', 'machine_translated']);
    const bad = await db.owner.query(
      'select 1 from public.destination_translations where reviewed_by is not null',
    );
    expect(bad.rowCount).toBe(0);
  });

  it('la BD y el código resuelven cada slug IGUAL (sin deriva entre registro y esquema)', async () => {
    for (const d of DESTINATIONS) {
      for (const l of LOCALES) {
        const slug = d.slugs[l].current;
        const { rows } = await db.owner.query<{ key: string }>(
          `select de.key from public.destination_slugs s join public.destinations de on de.id = s.destination_id
            where s.locale = $1 and s.slug = $2`,
          [l, slug],
        );
        expect(rows[0]?.key, `${l}/${slug}`).toBe(d.key);
        expect(resolveDestinationSlug(l, slug)).toEqual({ kind: 'found', key: d.key });
      }
    }
  });

  it('los nombres sembrados son los del registro, con su procedencia', async () => {
    const { rows } = await db.owner.query<{
      name: string;
      provenance: string;
      translation_status: string;
    }>(
      `select t.name, t.provenance, t.translation_status from public.destination_translations t
         join public.destinations d on d.id = t.destination_id where d.key = 'volcan-baru' and t.locale = 'en'`,
    );
    expect(rows[0]).toEqual({
      name: 'Barú Volcano',
      provenance: 'ai_translation_2026-10-20',
      translation_status: 'machine_translated',
    });
  });
});
