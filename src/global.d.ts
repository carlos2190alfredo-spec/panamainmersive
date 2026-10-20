import type { Locale } from '@/i18n/locales';
import type messages from '../messages/es.json';

// Tipado de claves: `es.json` es la fuente de verdad. La paridad con los demás idiomas
// la comprueba tests/unit/i18n/messages.test.ts.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
