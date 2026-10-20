import type { Client } from 'pg';
import { DESTINATIONS } from '../../src/domains/tourism/destinations';
import { LOCALES } from '../../src/i18n/locales';

/**
 * Siembra los nueve destinos desde el MISMO registro que usa la aplicación (src/domains/tourism),
 * para que BD y código no se desincronicen. Idempotente. Los destinos quedan en `draft`: publicar es
 * una decisión editorial (un revisor o admin), no una siembra.
 */
export async function seedDestinations(client: Client): Promise<void> {
  for (const d of DESTINATIONS) {
    const { rows } = await client.query<{ id: string }>(
      `insert into public.destinations (key, kind) values ($1, $2)
       on conflict (key) do update set kind = excluded.kind
       returning id`,
      [d.key, d.kind],
    );
    const id = rows[0]?.id;
    if (!id) throw new Error(`No se pudo sembrar ${d.key}`);

    for (const locale of LOCALES) {
      const slug = d.slugs[locale];
      await client.query(
        `insert into public.destination_slugs (destination_id, locale, slug, is_current)
         values ($1, $2, $3, true) on conflict (locale, slug) do nothing`,
        [id, locale, slug.current],
      );
      for (const alias of slug.aliases) {
        await client.query(
          `insert into public.destination_slugs (destination_id, locale, slug, is_current)
           values ($1, $2, $3, false) on conflict (locale, slug) do nothing`,
          [id, locale, alias],
        );
      }
      const n = d.names[locale];
      await client.query(
        `insert into public.destination_translations
           (destination_id, locale, name, source_language, source_version, translation_status, provenance)
         values ($1, $2, $3, 'es', 1, $4::public.translation_status, $5)
         on conflict (destination_id, locale) do update
           set name = excluded.name, translation_status = excluded.translation_status, provenance = excluded.provenance`,
        [id, locale, n.name, n.status, n.provenance],
      );
    }
  }
}
