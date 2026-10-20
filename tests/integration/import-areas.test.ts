import { createHash, randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  writeFileSync,
  readFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MANIFEST_KEYS, importAreas, type ImportOptions } from '../../scripts/db/import-areas-lib';
import { RIGHTS_POLICIES } from '../../src/lib/rights-policies';
import { createTestDb, type TestDb } from './helpers';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const square = (lon: number, lat: number, size = 0.05) => ({
  type: 'Polygon' as const,
  coordinates: [
    [
      [lon, lat],
      [lon + size, lat],
      [lon + size, lat + size],
      [lon, lat + size],
      [lon, lat],
    ],
  ],
});

interface FeatureSpec {
  id?: string;
  kind?: string;
  geometry?: unknown;
  name?: string | null;
  names?: Record<string, string>;
}
const feature = (s: FeatureSpec = {}) => {
  const id = s.id ?? randomUUID();
  return {
    type: 'Feature',
    id,
    geometry: s.geometry ?? square(-82.5, 8.8),
    properties: {
      overture_id: id,
      kind: s.kind ?? 'protected_area',
      source_theme: 'base',
      source_type: 'land_use',
      subtype: 'protected',
      class: 'national_park',
      name_local: s.name === undefined ? 'Parque de prueba' : s.name,
      names: s.names ?? {},
    },
  };
};

interface VersionOpts {
  dataset?: string;
  publishable?: boolean;
  links?: { destinationKey: string; overtureId: string; role: string; evidence: string }[];
  /** Cambia el manifiesto ANTES de escribirlo (para casos hostiles). */
  tweak?: (
    manifest: Record<string, unknown>,
    validText: string,
  ) => { manifest: Record<string, unknown>; validText: string };
  declaredValid?: number;
}

/** Escribe una versión (valid.geojsonl + quarantine.jsonl + manifest.json) como la dejaría el pipeline de Python. */
function makeVersion(features: unknown[], opts: VersionOpts = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'import-'));
  let validText = features.map((f) => JSON.stringify(f)).join('\n') + (features.length ? '\n' : '');
  const quarantineText = '';
  let manifest: Record<string, unknown> = {
    schema: 1,
    dataset: opts.dataset ?? 'overture-protected-areas',
    release: '2026-09-23.1',
    retrievedAt: '2026-10-20T00:00:00Z',
    source: {
      key: 'overture',
      institution: 'Overture Maps Foundation',
      url: 'https://overturemaps.org/',
      kind: 'osm_derived',
    },
    license: {
      name: 'ODbL',
      url: 'https://opendatacommons.org/licenses/odbl/',
      attribution: '© OpenStreetMap contributors, Overture Maps Foundation',
      rightsStatus: 'provisional',
    },
    validation: {
      rulesVersion: 1,
      workingArea: [-85, 5, -75, 11],
      maxVertices: 250000,
      repairs: 0,
    },
    counts: {
      read: features.length,
      skippedNotPolygonal: 0,
      duplicates: 0,
      quarantined: 0,
      valid: opts.declaredValid ?? features.length,
    },
    files: {
      valid: {
        name: 'valid.geojsonl',
        bytes: Buffer.byteLength(validText),
        sha256: sha(validText),
      },
      quarantine: { name: 'quarantine.jsonl', bytes: 0, sha256: sha(quarantineText) },
    },
    contentSha256: sha(validText),
    publishable: opts.publishable ?? true,
    links: opts.links ?? [],
  };
  if (opts.tweak) ({ manifest, validText } = opts.tweak(manifest, validText));
  writeFileSync(join(dir, 'valid.geojsonl'), validText);
  writeFileSync(join(dir, 'quarantine.jsonl'), quarantineText);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  return { dir, manifestPath: join(dir, 'manifest.json') };
}

const base = (manifestPath: string, o: Partial<ImportOptions> = {}): ImportOptions => ({
  manifestPath,
  targetEnv: 'development',
  policies: RIGHTS_POLICIES,
  publish: false,
  ...o,
});
const run = (manifestPath: string, o: Partial<ImportOptions> = {}) =>
  importAreas(db.owner, base(manifestPath, o));
const count = async (sql: string, params: unknown[] = []) =>
  Number(
    (await db.owner.query<{ n: string }>(`select count(*)::text as n from (${sql}) t`, params))
      .rows[0]?.n,
  );

describe('importación controlada de áreas a PostGIS', () => {
  it('importa, valida con PostGIS, calcula la superficie con geography y registra la procedencia', async () => {
    const f = feature({ names: { en: 'Test Park', fr: 'Parc de test' } });
    const { manifestPath } = makeVersion([f]);
    const result = await run(manifestPath);
    expect(result).toMatchObject({
      status: 'applied',
      areas: { created: 1, newVersion: 0, unchanged: 0 },
      names: 3,
    });

    const { rows } = await db.owner.query<{ area_m2: string }>(
      `select a.kind, a.source_class, a.is_public, g.validity, g.area_method, g.area_m2, g.is_current, g.version,
              sv.rights_status, sv.content_sha256
         from public.geographic_areas a
         join public.geometry_versions g on g.area_id = a.id
         join public.source_versions sv on sv.id = g.source_version_id
        where a.external_ref ->> 'overture_id' = $1`,
      [f.id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'protected_area',
      source_class: 'osm_derived',
      is_public: false,
      validity: 'valid',
      area_method: 'ST_Area(geography, EPSG:4326)',
      is_current: true,
      version: 1,
      rights_status: 'provisional',
    });
    // 0,05° × 0,05° a ≈ 8,8° N: ≈ 5,5 km × 5,5 km ≈ 30 km² (la medición geodésica, no la de grados)
    expect(Number(rows[0]?.area_m2) / 1e6).toBeGreaterThan(29);
    expect(Number(rows[0]?.area_m2) / 1e6).toBeLessThan(31.5);

    const names = await db.owner.query(
      `select locale, name, provenance from public.geographic_area_names n join public.geographic_areas a on a.id = n.area_id where a.external_ref ->> 'overture_id' = $1 order by locale nulls first`,
      [f.id],
    );
    expect(names.rows).toEqual([
      { locale: null, name: 'Parque de prueba', provenance: 'source_local' },
      { locale: 'en', name: 'Test Park', provenance: 'source_common' },
      { locale: 'fr', name: 'Parc de test', provenance: 'source_common' },
    ]);
  });

  it('es idempotente: repetir el mismo contenido no escribe nada y lo registra como «noop»', async () => {
    const { manifestPath } = makeVersion([feature(), feature({ geometry: square(-82.2, 8.9) })]);
    const first = await run(manifestPath);
    const areas = await count('select 1 from public.geographic_areas');
    const versions = await count('select 1 from public.geometry_versions');
    const second = await run(manifestPath);
    expect(first.status).toBe('applied');
    expect(second.status).toBe('noop');
    expect(await count('select 1 from public.geographic_areas')).toBe(areas);
    expect(await count('select 1 from public.geometry_versions')).toBe(versions);
    const runs = await db.owner.query<{ status: string }>(
      'select status from public.import_runs where content_sha256 = (select content_sha256 from public.import_runs order by created_at desc limit 1) order by created_at',
    );
    expect(runs.rows.map((r) => r.status)).toEqual(['applied', 'noop']);
  });

  it('una geometría que cambia crea la versión 2, deja la 1 como histórica y conserva UNA sola vigente', async () => {
    const id = randomUUID();
    await run(makeVersion([feature({ id })]).manifestPath);
    const second = await run(
      makeVersion([feature({ id, geometry: square(-82.5, 8.8, 0.08) })]).manifestPath,
    );
    expect(second.areas).toMatchObject({ created: 0, newVersion: 1 });
    const { rows } = await db.owner.query(
      "select version, is_current from public.geometry_versions g join public.geographic_areas a on a.id = g.area_id where a.external_ref ->> 'overture_id' = $1 order by version",
      [id],
    );
    expect(rows).toEqual([
      { version: 1, is_current: false },
      { version: 2, is_current: true },
    ]);
    // la MISMA geometría con otro nombre (contenido distinto) NO crea versión: solo cambia el nombre
    const third = await run(
      makeVersion([feature({ id, geometry: square(-82.5, 8.8, 0.08), name: 'Otro nombre' })])
        .manifestPath,
    );
    expect(third.areas).toMatchObject({ unchanged: 1, newVersion: 0 });
    const count2 = await db.owner.query<{ n: number }>(
      "select count(*)::int as n from public.geometry_versions g join public.geographic_areas a on a.id = g.area_id where a.external_ref ->> 'overture_id' = $1",
      [id],
    );
    expect(count2.rows[0]?.n).toBe(2);
  });

  it('visibilidad: lo importado NO es público hasta que alguien lo publica; entonces el visitante lo ve', async () => {
    const f = feature({ name: 'Visible tras publicar' });
    const { manifestPath } = makeVersion([f]);
    await run(manifestPath);
    const asAnon = () =>
      db.as(
        'anon',
        null,
        async (c) =>
          (
            await c.query(
              "select a.id from public.geographic_areas a where a.external_ref ->> 'overture_id' = $1",
              [f.id],
            )
          ).rows.length,
      );
    expect(await asAnon()).toBe(0);
    const published = await run(manifestPath, { publish: true });
    expect(published.status).toBe('noop');
    expect(published.published).toBe(1);
    expect(await asAnon()).toBe(1);
    // el visitante ve el nombre y SOLO la geometría vigente
    const seen = await db.as('anon', null, async (c) => ({
      names: (
        await c.query(
          "select n.name from public.geographic_area_names n join public.geographic_areas a on a.id = n.area_id where a.external_ref ->> 'overture_id' = $1",
          [f.id],
        )
      ).rows.length,
      geoms: (
        await c.query(
          "select g.id from public.geometry_versions g join public.geographic_areas a on a.id = g.area_id where a.external_ref ->> 'overture_id' = $1",
          [f.id],
        )
      ).rows.length,
    }));
    expect(seen).toEqual({ names: 1, geoms: 1 });
  });

  it('enlaza destinos con rol «context» y evidencia; si el destino no existe lo cuenta y sigue', async () => {
    await db.owner.query(
      "insert into public.destinations (key, kind) values ('boquete-test', 'locality') on conflict do nothing",
    );
    const f = feature({ kind: 'locality' });
    const links = [
      {
        destinationKey: 'boquete-test',
        overtureId: f.id,
        role: 'context',
        evidence: 'Referencia, no límite',
      },
      { destinationKey: 'no-existe', overtureId: f.id, role: 'context', evidence: 'x' },
    ];
    const result = await run(
      makeVersion([f], { dataset: 'overture-destination-references', publishable: false, links })
        .manifestPath,
    );
    expect(result.links).toEqual({ applied: 1, skippedNoDestination: 1 });
    const row = await db.owner.query(
      "select da.role, da.evidence from public.destination_areas da join public.destinations d on d.id = da.destination_id where d.key = 'boquete-test'",
    );
    expect(row.rows).toEqual([{ role: 'context', evidence: 'Referencia, no límite' }]);
  });

  it('el contrato de claves del manifiesto coincide con el que escribe el pipeline de Python', () => {
    const keys = JSON.parse(readFileSync('pipelines/ingest/manifest-keys.json', 'utf8')) as {
      top: string[];
    };
    expect([...MANIFEST_KEYS].sort()).toEqual([...keys.top].sort());
  });
});

describe('importación: entradas hostiles y verificaciones de seguridad', () => {
  const rejected = async (
    manifestPath: string,
    message: RegExp,
    o: Partial<ImportOptions> = {},
  ) => {
    const before = await count('select 1 from public.geographic_areas');
    await expect(run(manifestPath, o)).rejects.toThrow(message);
    expect(await count('select 1 from public.geographic_areas')).toBe(before); // sin rastro: todo se revirtió
  };

  it('rechaza datos alterados tras generar el manifiesto (hash)', async () => {
    const { dir, manifestPath } = makeVersion([feature()]);
    writeFileSync(
      join(dir, 'valid.geojsonl'),
      JSON.stringify(feature({ name: 'Inyectado' })) + '\n',
    );
    await rejected(manifestPath, /tamaño|hash/);
  });

  it('rechaza un fichero alterado con el MISMO tamaño (solo el hash lo delata)', async () => {
    const f = feature({ name: 'AAAAAAAA' });
    const { dir, manifestPath } = makeVersion([f]);
    writeFileSync(
      join(dir, 'valid.geojsonl'),
      JSON.stringify({ ...f, properties: { ...f.properties, name_local: 'BBBBBBBB' } }) + '\n',
    );
    await rejected(manifestPath, /hash/);
  });

  it('rechaza un manifiesto con claves de más (esquema estricto) o con tipos incorrectos', async () => {
    await rejected(
      makeVersion([feature()], {
        tweak: (m, t) => ({ manifest: { ...m, extra: 1 }, validText: t }),
      }).manifestPath,
      /Manifiesto inválido/,
    );
    await rejected(
      makeVersion([feature()], {
        tweak: (m, t) => ({
          manifest: { ...m, validation: { ...(m.validation as object), repairs: 3 } },
          validText: t,
        }),
      }).manifestPath,
      /Manifiesto inválido/,
    );
  });

  it('rechaza nombres de fichero con rutas y enlaces simbólicos que escapan', async () => {
    const evil = (name: string) =>
      makeVersion([feature()], {
        tweak: (m, t) => ({
          manifest: {
            ...m,
            files: {
              ...(m.files as object),
              valid: { ...(m.files as { valid: object }).valid, name },
            },
          },
          validText: t,
        }),
      }).manifestPath;
    await rejected(evil('../valid.geojsonl'), /no permitido/);
    await rejected(evil('/etc/passwd'), /no permitido/);
    const { dir, manifestPath } = makeVersion([feature()]);
    const outside = mkdtempSync(join(tmpdir(), 'outside-'));
    const target = join(outside, 'otro.geojsonl');
    writeFileSync(target, readFileSync(join(dir, 'valid.geojsonl')));
    mkdirSync(join(dir, 'x'), { recursive: true });
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
      files: { valid: { name: string } };
    };
    writeFileSync(join(dir, 'valid.geojsonl'), '');
    symlinkSync(target, join(dir, 'valid.geojsonl.enlace'));
    manifest.files.valid.name = 'valid.geojsonl.enlace';
    writeFileSync(manifestPath, JSON.stringify(manifest));
    await rejected(manifestPath, /sale del directorio/);
  });

  it('el recuento declarado debe coincidir con el contenido', async () => {
    await rejected(
      makeVersion([feature(), feature()], { declaredValid: 5 }).manifestPath,
      /declara 5/,
    );
  });

  it('DERECHOS: con políticas provisionales no se importa para producción; «verified» sí, y el manifiesto no puede mejorarlas', async () => {
    const provisional = makeVersion([feature()]).manifestPath;
    await rejected(provisional, /Derechos.*provisional-in-production/, { targetEnv: 'production' });
    // un manifiesto que se declara «verified» NO cambia el veredicto: manda la política del repositorio
    const lying = makeVersion([feature()], {
      tweak: (m, t) => ({
        manifest: { ...m, license: { ...(m.license as object), rightsStatus: 'verified' } },
        validText: t,
      }),
    }).manifestPath;
    await rejected(lying, /Derechos/, { targetEnv: 'production' });
    const verified = RIGHTS_POLICIES.map((p) => ({ ...p, status: 'verified' as const }));
    const ok = await run(makeVersion([feature()]).manifestPath, {
      targetEnv: 'production',
      policies: verified,
    });
    expect(ok.status).toBe('applied');
  });

  it('sin política para la fuente o sin la acción permitida, deniega', async () => {
    await rejected(makeVersion([feature()]).manifestPath, /Derechos.*no-policy/, { policies: [] });
    const noRedistribute = RIGHTS_POLICIES.map((p) => ({
      ...p,
      allowed: p.allowed.filter((a) => a !== 'redistribute'),
    }));
    await rejected(makeVersion([feature()]).manifestPath, /redistribute.*action-not-allowed/, {
      policies: noRedistribute,
    });
  });

  it('un dataset no publicable (referencias) no se puede publicar directamente', async () => {
    await rejected(
      makeVersion([feature()], { dataset: 'overture-destination-references', publishable: false })
        .manifestPath,
      /no es publicable/,
      { publish: true },
    );
  });

  it('DEFENSA EN PROFUNDIDAD: aunque se recalcule el hash, la BD rechaza ejes invertidos (CHECK) y no queda nada', async () => {
    const swapped = feature({
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [8.8, -82.5],
            [8.85, -82.5],
            [8.85, -82.45],
            [8.8, -82.45],
            [8.8, -82.5],
          ],
        ],
      },
    });
    await rejected(
      makeVersion([swapped]).manifestPath,
      /geometry_in_working_area|violates check constraint/,
    );
  });

  it('DEFENSA EN PROFUNDIDAD: una geometría inválida con hash correcto la marca PostGIS y la importación se revierte entera', async () => {
    const bowtie = feature({
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-82.5, 8.8],
            [-82.4, 8.7],
            [-82.4, 8.8],
            [-82.5, 8.7],
            [-82.5, 8.8],
          ],
        ],
      },
    });
    const good = feature();
    const before = await count('select 1 from public.geographic_areas');
    await expect(run(makeVersion([good, bowtie]).manifestPath)).rejects.toThrow(/inválidas/);
    expect(await count('select 1 from public.geographic_areas')).toBe(before); // ni siquiera la buena: todo o nada
    expect(
      await count(
        "select 1 from public.geographic_areas where external_ref ->> 'overture_id' = $1",
        [good.id],
      ),
    ).toBe(0);
  });

  it('un conflicto de identidad (mismo ID, otro tipo) se rechaza: la identidad es el ID, no el nombre', async () => {
    const id = randomUUID();
    await run(makeVersion([feature({ id, kind: 'protected_area' })]).manifestPath);
    await rejected(
      makeVersion([feature({ id, kind: 'locality', geometry: square(-80, 8) })]).manifestPath,
      /Conflicto de identidad/,
    );
  });

  it('nombres con caracteres de control o demasiado largos los rechaza la BD', async () => {
    await rejected(
      makeVersion([feature({ name: 'mal\u0007nombre' })]).manifestPath,
      /violates check constraint|names/,
    );
  });

  it('una línea que no cumple el esquema del fichero válido detiene la importación', async () => {
    const { manifestPath } = makeVersion([
      { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
    ]);
    await rejected(manifestPath, /no cumple el esquema/);
  });
});

const REAL = 'data/build/ingest/overture-protected-areas/2026-09-23.1/manifest.json';
describe.skipIf(!existsSync(REAL))(
  'DATOS REALES (solo si existe el artefacto de `pnpm data:ingest`)',
  () => {
    it('las áreas protegidas reales de Overture pasan la validación de PostGIS y quedan con superficie geodésica', async () => {
      const result = await run(REAL);
      expect(result.status).toBe('applied');
      expect(result.areas.created).toBeGreaterThan(100);
      const bad = await count(
        "select 1 from public.geometry_versions where validity <> 'valid' or area_m2 is null or area_m2 <= 0",
      );
      expect(bad).toBe(0);
      const named = await count(
        "select 1 from public.geographic_area_names where provenance = 'source_local'",
      );
      expect(named).toBeGreaterThan(100);
    });
  },
);
