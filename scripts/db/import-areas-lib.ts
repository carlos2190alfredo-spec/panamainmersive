import { createHash } from 'node:crypto';
import { createReadStream, realpathSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, relative, isAbsolute } from 'node:path';
import { createInterface } from 'node:readline';
import type { Client } from 'pg';
import { z } from 'zod';
import {
  evaluateRights,
  type RightsPolicy,
  type SiteEnv,
} from '../../src/domains/geography/rights';

/**
 * Cargador de una versión importada a PostGIS (docs/gis.md §3, ADR-0015). No confía en el pipeline de Python:
 * vuelve a comprobar hash y tamaño del fichero, derechos (con las políticas del repositorio, no con lo que diga el
 * manifiesto) y deja que PostGIS decida la validez geométrica (el trigger registra `validity`; aquí se exige 0 inválidas).
 * Idempotente por (dataset, contentSha256) y por ID externo; nunca empareja por nombre.
 */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

const AREA_KINDS = [
  'country',
  'region',
  'county',
  'locality',
  'protected_area',
  'island',
  'water_body',
  'historic_district',
  'infrastructure',
  'editorial_area',
] as const;
const SHA = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const FILE = z
  .object({
    name: z.string(),
    bytes: z.number().int().nonnegative(),
    sha256: z.string().regex(SHA),
  })
  .strict();

const ManifestSchema = z
  .object({
    schema: z.literal(1),
    dataset: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
    release: z.string().min(1).max(40),
    retrievedAt: z.string().datetime(),
    source: z
      .object({
        key: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
        institution: z.string().min(1),
        url: z.string().url().optional(),
        kind: z.enum(['official', 'osm_derived', 'open_data', 'commercial', 'editorial']),
      })
      .strict(),
    license: z
      .object({
        name: z.string().min(1),
        url: z.string().url().optional(),
        attribution: z.string().min(1),
        rightsStatus: z.enum(['verified', 'provisional']),
      })
      .strict(),
    validation: z
      .object({
        rulesVersion: z.number().int(),
        workingArea: z.array(z.number()).length(4),
        maxVertices: z.number().int(),
        repairs: z.literal(0),
      })
      .strict(),
    counts: z
      .object({
        read: z.number().int(),
        skippedNotPolygonal: z.number().int(),
        duplicates: z.number().int(),
        quarantined: z.number().int(),
        valid: z.number().int(),
      })
      .strict(),
    files: z.object({ valid: FILE, quarantine: FILE }).strict(),
    contentSha256: z.string().regex(SHA),
    publishable: z.boolean(),
    links: z.array(
      z
        .object({
          destinationKey: z.string(),
          overtureId: z.string().regex(UUID),
          role: z.enum(['primary', 'context', 'access']),
          evidence: z.string().min(1),
        })
        .strict(),
    ),
  })
  .strict();
export type Manifest = z.infer<typeof ManifestSchema>;
export const MANIFEST_KEYS = Object.keys(ManifestSchema.shape);

const FeatureSchema = z.object({
  type: z.literal('Feature'),
  geometry: z.object({
    type: z.enum(['Polygon', 'MultiPolygon']),
    coordinates: z.array(z.unknown()),
  }),
  properties: z.object({
    overture_id: z.string().regex(UUID),
    kind: z.enum(AREA_KINDS),
    source_theme: z.string().optional(),
    source_type: z.string().optional(),
    subtype: z.string().nullable().optional(),
    class: z.string().nullable().optional(),
    name_local: z.string().max(300).nullable().optional(),
    names: z.record(z.string(), z.string().max(300)).optional(),
    wikidata: z.string().optional(),
  }),
});

export interface ImportOptions {
  /** Ruta del `manifest.json`; los ficheros de datos deben estar en SU MISMO directorio. */
  readonly manifestPath: string;
  readonly targetEnv: SiteEnv;
  /** Políticas de derechos del repositorio (la verdad; el manifiesto no puede mejorarlas). */
  readonly policies: readonly RightsPolicy[];
  readonly publish: boolean;
}

export interface ImportResult {
  readonly status: 'applied' | 'noop';
  readonly areas: { created: number; newVersion: number; unchanged: number };
  readonly names: number;
  readonly links: { applied: number; skippedNoDestination: number };
  readonly published: number;
}

/** Fichero de datos junto al manifiesto: solo el nombre, sin separadores, regular y dentro del directorio. */
function dataFile(manifestDir: string, name: string): string {
  if (name !== basename(name) || name.includes('..') || isAbsolute(name)) {
    throw new ImportError(`Nombre de fichero no permitido en el manifiesto: ${name}`);
  }
  const full = realpathSync(join(manifestDir, name));
  const rel = relative(realpathSync(manifestDir), full);
  if (rel.startsWith('..') || isAbsolute(rel))
    throw new ImportError(`El fichero ${name} sale del directorio de la versión`);
  if (!statSync(full).isFile()) throw new ImportError(`${name} no es un fichero regular`);
  return full;
}

async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}

export async function readManifest(
  manifestPath: string,
): Promise<{ manifest: Manifest; validPath: string }> {
  const manifestDir = dirname(realpathSync(manifestPath));
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new ImportError(
      `Manifiesto ilegible: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const parsed = ManifestSchema.safeParse(raw);
  if (!parsed.success)
    throw new ImportError(
      `Manifiesto inválido: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  const manifest = parsed.data;
  if (manifest.contentSha256 !== manifest.files.valid.sha256)
    throw new ImportError('contentSha256 no coincide con el hash del fichero válido');
  const validPath = dataFile(manifestDir, manifest.files.valid.name);
  if (statSync(validPath).size !== manifest.files.valid.bytes)
    throw new ImportError('El tamaño del fichero válido no coincide con el manifiesto');
  if ((await sha256(validPath)) !== manifest.files.valid.sha256)
    throw new ImportError('El hash del fichero válido no coincide: los datos fueron alterados');
  return { manifest, validPath };
}

const MAX_LINE = 32 * 1024 * 1024;

export async function importAreas(client: Client, options: ImportOptions): Promise<ImportResult> {
  const { manifest, validPath } = await readManifest(options.manifestPath);

  // Derechos con las políticas del REPOSITORIO: un manifiesto no puede declararse «verified» por su cuenta.
  const actions = options.publish
    ? (['transform', 'redistribute', 'display'] as const)
    : (['transform', 'redistribute'] as const);
  for (const action of actions) {
    const decision = evaluateRights(
      options.policies,
      manifest.source.key,
      action,
      options.targetEnv,
    );
    if (!decision.allowed)
      throw new ImportError(
        `Derechos: ${manifest.source.key}/${action} denegado (${decision.reason}) en ${options.targetEnv}`,
      );
  }
  if (options.publish && !manifest.publishable)
    throw new ImportError(
      `El dataset ${manifest.dataset} no es publicable directamente (se publica por sus destinos)`,
    );
  const policy = options.policies.find((p) => p.subject === manifest.source.key);
  if (!policy) throw new ImportError(`Sin política de derechos para ${manifest.source.key}`);

  await client.query('begin');
  try {
    await client.query('select pg_advisory_xact_lock(hashtext($1))', [
      `import:${manifest.dataset}`,
    ]);

    const source = await client.query<{ id: string }>(
      `insert into public.data_sources (key, institution, url, kind) values ($1, $2, $3, $4)
       on conflict (key) do update set institution = excluded.institution, url = excluded.url
       returning id`,
      [
        manifest.source.key,
        manifest.source.institution,
        manifest.source.url ?? null,
        manifest.source.kind,
      ],
    );
    const versionLabel = `${manifest.release}:${manifest.dataset}:${manifest.contentSha256.slice(0, 12)}`;
    const version = await client.query<{ id: string }>(
      `insert into public.source_versions
         (source_id, version_label, retrieved_at, source_url, content_sha256, license_name, license_url, attribution, rights_status)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       on conflict (source_id, version_label) do update set rights_status = excluded.rights_status
       returning id`,
      [
        source.rows[0]?.id,
        versionLabel,
        manifest.retrievedAt,
        manifest.source.url ?? null,
        manifest.contentSha256,
        manifest.license.name,
        manifest.license.url ?? null,
        manifest.license.attribution,
        policy.status,
      ],
    );
    const sourceVersionId = version.rows[0]?.id as string;

    const prior = await client.query<{ id: string; published: boolean }>(
      "select id, published from public.import_runs where dataset = $1 and content_sha256 = $2 and status = 'applied' limit 1",
      [manifest.dataset, manifest.contentSha256],
    );
    const unchangedContent = prior.rows.length > 0;

    const result: {
      areas: ImportResult['areas'];
      names: number;
      links: ImportResult['links'];
      published: number;
    } = {
      areas: { created: 0, newVersion: 0, unchanged: 0 },
      names: 0,
      links: { applied: 0, skippedNoDestination: 0 },
      published: 0,
    };
    const areaIds = new Map<string, string>();

    if (!unchangedContent) {
      const lines = createInterface({
        input: createReadStream(validPath, { encoding: 'utf8' }),
        crlfDelay: Infinity,
      });
      let n = 0;
      for await (const line of lines) {
        if (line.length > MAX_LINE)
          throw new ImportError('Línea demasiado larga en el fichero válido');
        if (line.trim() === '') continue;
        n++;
        const parsed = FeatureSchema.safeParse(JSON.parse(line));
        if (!parsed.success)
          throw new ImportError(
            `Línea ${n} del fichero válido no cumple el esquema: ${parsed.error.issues[0]?.message ?? '?'}`,
          );
        const { properties: p, geometry } = parsed.data;
        const oid = p.overture_id;

        const existing = await client.query<{ id: string; kind: string }>(
          "select id, kind from public.geographic_areas where external_ref ->> 'overture_id' = $1",
          [oid],
        );
        let areaId = existing.rows[0]?.id;
        if (areaId) {
          if (existing.rows[0]?.kind !== p.kind)
            throw new ImportError(
              `Conflicto de identidad: ${oid} ya existe como ${existing.rows[0]?.kind}, no como ${p.kind}`,
            );
        } else {
          const ref = {
            overture_id: oid,
            source_theme: p.source_theme,
            source_type: p.source_type,
            subtype: p.subtype ?? null,
            class: p.class ?? null,
            ...(p.wikidata ? { wikidata: p.wikidata } : {}),
          };
          const inserted = await client.query<{ id: string }>(
            "insert into public.geographic_areas (kind, source_class, external_ref) values ($1, 'osm_derived', $2) returning id",
            [p.kind, JSON.stringify(ref)],
          );
          areaId = inserted.rows[0]?.id ?? '';
          result.areas.created++;
        }
        areaIds.set(oid, areaId);

        const geomJson = JSON.stringify(geometry);
        const same = await client.query<{ same: boolean }>(
          `select exists (select 1 from public.geometry_versions where area_id = $1 and is_current
                          and st_orderingequals(geom, st_setsrid(st_geomfromgeojson($2), 4326))) as same`,
          [areaId, geomJson],
        );
        if (same.rows[0]?.same) {
          result.areas.unchanged++;
        } else {
          await client.query(
            'update public.geometry_versions set is_current = false where area_id = $1 and is_current',
            [areaId],
          );
          const v = await client.query<{ version: number }>(
            `insert into public.geometry_versions (area_id, version, source_version_id, geom, is_current)
             values ($1, coalesce((select max(version) from public.geometry_versions where area_id = $1), 0) + 1, $2,
                     st_setsrid(st_geomfromgeojson($3), 4326), true)
             returning version`,
            [areaId, sourceVersionId, geomJson],
          );
          if ((v.rows[0]?.version ?? 1) > 1) result.areas.newVersion++;
        }

        if (p.name_local) {
          await client.query(
            `insert into public.geographic_area_names (area_id, locale, name, provenance, source_version_id)
             values ($1, null, $2, 'source_local', $3)
             on conflict (area_id) where provenance = 'source_local' do update set name = excluded.name, source_version_id = excluded.source_version_id`,
            [areaId, p.name_local, sourceVersionId],
          );
          result.names++;
        }
        for (const [locale, name] of Object.entries(p.names ?? {})) {
          await client.query(
            `insert into public.geographic_area_names (area_id, locale, name, provenance, source_version_id)
             values ($1, $2, $3, 'source_common', $4)
             on conflict (area_id, locale, provenance) where locale is not null do update set name = excluded.name, source_version_id = excluded.source_version_id`,
            [areaId, locale, name, sourceVersionId],
          );
          result.names++;
        }
      }
      if (n !== manifest.counts.valid)
        throw new ImportError(
          `El fichero válido tiene ${n} entidades y el manifiesto declara ${manifest.counts.valid}`,
        );

      // Cinturón y tirantes: PostGIS ya comprobó cada geometría; no se admite NINGUNA inválida.
      const invalid = await client.query<{ count: string }>(
        "select count(*)::text as count from public.geometry_versions where source_version_id = $1 and validity <> 'valid'",
        [sourceVersionId],
      );
      if (Number(invalid.rows[0]?.count) > 0)
        throw new ImportError(
          `PostGIS marcó ${invalid.rows[0]?.count} geometrías como inválidas: no se importa nada`,
        );
    } else {
      // Contenido ya importado: no se reescribe nada, pero se identifican las áreas para enlaces y publicación.
      const oids: string[] = [];
      const lines = createInterface({
        input: createReadStream(validPath, { encoding: 'utf8' }),
        crlfDelay: Infinity,
      });
      for await (const line of lines) {
        if (line.trim() === '') continue;
        const parsed = FeatureSchema.safeParse(JSON.parse(line));
        if (parsed.success) oids.push(parsed.data.properties.overture_id);
      }
      const known = await client.query<{ id: string; oid: string }>(
        "select id, external_ref ->> 'overture_id' as oid from public.geographic_areas where external_ref ->> 'overture_id' = any($1)",
        [oids],
      );
      for (const row of known.rows) areaIds.set(row.oid, row.id);
    }

    for (const link of manifest.links) {
      const destination = await client.query<{ id: string }>(
        'select id from public.destinations where key = $1',
        [link.destinationKey],
      );
      const areaId = areaIds.get(link.overtureId);
      if (!destination.rows[0] || !areaId) {
        result.links.skippedNoDestination++;
        continue;
      }
      const ins = await client.query(
        'insert into public.destination_areas (destination_id, area_id, role, evidence) values ($1, $2, $3, $4) on conflict do nothing',
        [destination.rows[0].id, areaId, link.role, link.evidence],
      );
      result.links.applied += ins.rowCount ?? 0;
    }

    if (options.publish) {
      const upd = await client.query(
        'update public.geographic_areas set is_public = true where id = any($1) and not is_public',
        [[...areaIds.values()]],
      );
      result.published = upd.rowCount ?? 0;
    }

    const status: ImportResult['status'] = unchangedContent ? 'noop' : 'applied';
    await client.query(
      `insert into public.import_runs (dataset, source_version_id, content_sha256, status, counts, quarantine_count, published)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        manifest.dataset,
        sourceVersionId,
        manifest.contentSha256,
        status,
        JSON.stringify({ ...result, manifest: manifest.counts }),
        manifest.counts.quarantined + manifest.counts.duplicates,
        options.publish,
      ],
    );
    await client.query('commit');
    return { status, ...result };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}
