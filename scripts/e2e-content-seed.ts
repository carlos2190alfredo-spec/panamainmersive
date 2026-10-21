import type { Client } from 'pg';

/**
 * Siembra contenido SINTÉTICO por el flujo editorial REAL (editor redacta → revisor verifica, con los disparadores y
 * la RLS de la migración 0007). Los textos dicen «sintético E2E» a propósito: no describen Panamá y solo existen en
 * una base temporal y en la copia temporal de la aplicación que construye `scripts/e2e-content.ts`.
 */
export const PEOPLE = {
  editor: '00000000-0000-4000-8000-0000000000e1',
  reviewer: '00000000-0000-4000-8000-0000000000b1',
  reviewer2: '00000000-0000-4000-8000-0000000000b2',
} as const;

export const SYNTHETIC = {
  summaryEs: 'Texto sintético de prueba E2E (no describe Panamá).',
  summaryEn: 'Synthetic E2E test text (it does not describe Panama).',
  seasonEs: 'Segundo texto sintético E2E, sin traducción.',
  expiredEs: 'Reglas sintéticas E2E que ya vencieron.',
  disputedEs: 'Peligros sintéticos E2E en disputa.',
} as const;

async function as(owner: Client, sub: string): Promise<void> {
  await owner.query("select set_config('request.jwt.claims', $1, false)", [
    JSON.stringify({ sub, role: 'authenticated' }),
  ]);
}

interface Spec {
  destination: string;
  fieldKey: string;
  text?: string;
  quantity?: { value: number; unit: string };
  validDays?: number;
  sourceClass?: string;
}

let sourceCounter = 0;

async function verified(owner: Client, spec: Spec): Promise<string> {
  await as(owner, PEOPLE.editor);
  const { rows } = await owner.query<{ id: string }>(
    `insert into public.field_assertions
       (destination_id, field_key, source_locale, original_text, quantity_value, quantity_unit, valid_until)
     values ((select id from public.destinations where key = $1), $2, 'es', $3, $4, $5,
             case when $6::int is null then null else (now() at time zone 'UTC')::date + $6::int end)
     returning id`,
    [
      spec.destination,
      spec.fieldKey,
      spec.text ?? null,
      spec.quantity?.value ?? null,
      spec.quantity?.unit ?? null,
      spec.validDays ?? null,
    ],
  );
  const id = (rows[0] as { id: string }).id;
  sourceCounter += 1;
  const source = await owner.query<{ id: string }>(
    `insert into public.source_records (source_class, institution, title, url, published_on, retrieved_at, license_name, license_url)
     values ($1::public.content_source_class, 'Institución sintética E2E', $2, $3, '2026-01-15',
             now() - interval '10 days', 'Licencia sintética E2E', 'https://example.org/licencia')
     returning id`,
    [
      spec.sourceClass ?? 'official',
      `Documento sintético E2E ${String(sourceCounter)}`,
      `https://example.org/e2e/fuente-${String(sourceCounter)}`,
    ],
  );
  await owner.query(
    `insert into public.assertion_evidence (assertion_id, source_record_id, locator, excerpt)
     values ($1, $2, 'sección sintética', null)`,
    [id, (source.rows[0] as { id: string }).id],
  );
  await owner.query("update public.field_assertions set status = 'in_review' where id = $1", [id]);
  await as(owner, PEOPLE.reviewer);
  await owner.query(
    "update public.field_assertions set status = 'verified', confidence = 'medium' where id = $1",
    [id],
  );
  return id;
}

export async function seedContent(owner: Client): Promise<void> {
  for (const [name, id] of Object.entries(PEOPLE)) {
    await owner.query('insert into public.profiles (id, display_name) values ($1, $2)', [id, name]);
  }
  for (const [id, role] of [
    [PEOPLE.editor, 'editor'],
    [PEOPLE.reviewer, 'reviewer'],
    [PEOPLE.reviewer2, 'reviewer'],
  ] as const) {
    await owner.query(
      'insert into public.user_roles (user_id, role) values ($1, $2::public.app_role)',
      [id, role],
    );
  }
  await owner.query(
    `insert into public.destinations (key, kind, status) values
       ('boquete', 'locality', 'published'), ('volcan-baru', 'volcano', 'published')`,
  );

  // Resumen con traducción humana revisada al inglés
  const summary = await verified(owner, {
    destination: 'boquete',
    fieldKey: 'overview.summary',
    text: SYNTHETIC.summaryEs,
  });
  await as(owner, PEOPLE.editor);
  await owner.query(
    `insert into public.assertion_translations (assertion_id, locale, text, provenance, status, translated_by)
     values ($1, 'en', $2, 'human_translation', 'draft', $3)`,
    [summary, SYNTHETIC.summaryEn, PEOPLE.editor],
  );
  await as(owner, PEOPLE.reviewer2);
  await owner.query(
    `update public.assertion_translations set status = 'published', reviewed_by = $2, reviewed_at = now()
      where assertion_id = $1 and locale = 'en'`,
    [summary, PEOPLE.reviewer2],
  );

  // Verificado y vigente, sin traducción (en los demás idiomas se muestra el original, con su indicador)
  await verified(owner, {
    destination: 'boquete',
    fieldKey: 'visit.best_season',
    text: SYNTHETIC.seasonEs,
    validDays: 60,
  });

  // Vencido: se simula el paso del tiempo (solo aquí, saltando los disparadores)
  const expired = await verified(owner, {
    destination: 'boquete',
    fieldKey: 'restrictions.entry_rules',
    text: SYNTHETIC.expiredEs,
    validDays: 30,
  });
  await owner.query('set session_replication_role = replica');
  await owner.query(
    "update public.field_assertions set valid_until = (now() at time zone 'America/Panama')::date - 1 where id = $1",
    [expired],
  );
  await owner.query('set session_replication_role = origin');

  // En disputa
  const disputed = await verified(owner, {
    destination: 'boquete',
    fieldKey: 'safety.hazards',
    text: SYNTHETIC.disputedEs,
    validDays: 30,
  });
  await as(owner, PEOPLE.reviewer);
  await owner.query(
    "update public.field_assertions set status = 'disputed', status_note = 'Disputa sintética E2E' where id = $1",
    [disputed],
  );

  // Cantidad en un volcán
  await verified(owner, {
    destination: 'volcan-baru',
    fieldKey: 'facts.elevation_m',
    quantity: { value: 3475, unit: 'm' },
    sourceClass: 'scientific',
  });
}
