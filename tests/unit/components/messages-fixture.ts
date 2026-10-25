import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LOCALES, type Locale } from '@/i18n/locales';

/** Los mensajes REALES de cada idioma (los mismos que sirve la aplicación). */
export const MESSAGES: Readonly<Record<Locale, Record<string, unknown>>> = Object.fromEntries(
  LOCALES.map((locale) => [
    locale,
    JSON.parse(readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8')) as Record<
      string,
      unknown
    >,
  ]),
) as Record<Locale, Record<string, unknown>>;
