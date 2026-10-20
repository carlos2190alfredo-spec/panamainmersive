import { ids, seedPeople, type TestDb } from './helpers';

/** Polígono simple (lon/lat) dentro del área de trabajo de Panamá. */
export const square = (lon: number, lat: number, size = 0.1): string =>
  `SRID=4326;POLYGON((${lon} ${lat}, ${lon + size} ${lat}, ${lon + size} ${lat + size}, ${lon} ${lat + size}, ${lon} ${lat}))`;

export interface World {
  sourceVersionId: string;
  pubDest: string;
  draftDest: string;
  areaPublic: string;
  areaLinked: string;
  areaPrivate: string;
  areaEditorial: string;
}

/** Datos mínimos pero representativos, creados como propietario (saltando RLS). */
export async function seedWorld(db: TestDb): Promise<World> {
  await seedPeople(db);
  const q = async <T extends Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T> => (await db.owner.query<T>(sql, params)).rows[0] as T;

  const src = await q<{ id: string }>(
    "insert into public.data_sources (key, institution, kind) values ('overture', 'Overture Maps Foundation', 'osm_derived') returning id",
  );
  const sv = await q<{ id: string }>(
    `insert into public.source_versions (source_id, version_label, retrieved_at, license_name, attribution, rights_status)
     values ($1, '2026-09-23.1', now(), 'ODbL', '© OpenStreetMap contributors, Overture Maps Foundation', 'provisional')
     returning id`,
    [src.id],
  );

  const pub = await q<{ id: string }>(
    "insert into public.destinations (key, kind, status) values ('pub-dest', 'locality', 'published') returning id",
  );
  const draft = await q<{ id: string }>(
    "insert into public.destinations (key, kind, status) values ('draft-dest', 'locality', 'draft') returning id",
  );

  // Traducciones: una publicada (revisada por una persona), una automática, y un borrador de otro destino.
  await db.owner.query(
    `insert into public.destination_translations
       (destination_id, locale, name, source_language, source_version, translation_status, reviewed_by, reviewed_at, provenance)
     values ($1, 'es', 'Destino público', 'es', 1, 'published', $2, now(), 'toponym_original')`,
    [pub.id, ids.reviewer2],
  );
  await db.owner.query(
    `insert into public.destination_translations
       (destination_id, locale, name, source_language, source_version, translation_status, provenance)
     values ($1, 'en', 'Public destination', 'es', 1, 'machine_translated', 'ai_translation')`,
    [pub.id],
  );
  await db.owner.query(
    `insert into public.destination_translations
       (destination_id, locale, name, source_language, source_version, translation_status, provenance)
     values ($1, 'es', 'Destino en borrador', 'es', 1, 'draft', 'toponym_original')`,
    [draft.id],
  );

  await db.owner.query(
    `insert into public.destination_slugs (destination_id, locale, slug) values
       ($1, 'es', 'destino-publico'), ($2, 'es', 'destino-borrador')`,
    [pub.id, draft.id],
  );

  const area = async (cls: string, isPublic: boolean): Promise<string> =>
    (
      await q<{ id: string }>(
        'insert into public.geographic_areas (kind, source_class, is_public) values ($1, $2::public.geometry_source_class, $3) returning id',
        ['county', cls, isPublic],
      )
    ).id;
  const areaPublic = await area('osm_derived', true);
  const areaLinked = await area('osm_derived', false);
  const areaPrivate = await area('osm_derived', false);
  const areaEditorial = await area('editorial', false);

  const geom = (
    areaId: string,
    version: number,
    current: boolean,
    wkt: string,
    withSource = true,
  ) =>
    db.owner.query(
      `insert into public.geometry_versions (area_id, version, source_version_id, geom, is_current)
       values ($1, $2, $3, $4::geometry, $5)`,
      [areaId, version, withSource ? sv.id : null, wkt, current],
    );
  await geom(areaPublic, 1, false, square(-79.6, 8.9));
  await geom(areaPublic, 2, true, square(-79.5, 8.9));
  await geom(areaLinked, 1, true, square(-82.5, 8.7));
  await geom(areaPrivate, 1, true, square(-81.0, 8.1));
  await geom(areaEditorial, 1, true, square(-79.9, 9.2), false);

  await db.owner.query(
    "insert into public.destination_areas (destination_id, area_id, role) values ($1, $2, 'primary')",
    [pub.id, areaLinked],
  );
  await db.owner.query(
    "insert into public.destination_areas (destination_id, area_id, role) values ($1, $2, 'primary')",
    [draft.id, areaPrivate],
  );

  await db.owner.query(
    `insert into public.visual_coverage (destination_id, capability, provider, status, method, observed_at, expires_at)
     values ($1, 'geometry', 'overture', 'VERIFIED', 'name search', '2026-10-20', '2027-01-18'),
            ($2, 'geometry', 'overture', 'VERIFIED', 'name search', '2026-10-20', '2027-01-18')`,
    [pub.id, draft.id],
  );
  await db.owner.query(
    "insert into public.rights_policies (subject, status) values ('overture', 'provisional')",
  );

  return {
    sourceVersionId: sv.id,
    pubDest: pub.id,
    draftDest: draft.id,
    areaPublic,
    areaLinked,
    areaPrivate,
    areaEditorial,
  };
}
