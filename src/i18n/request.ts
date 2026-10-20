import { notFound } from 'next/navigation';
import * as rootParams from 'next/root-params';
import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { PANAMA_TIME_ZONE } from './format';
import { routing } from './routing';

export default getRequestConfig(async ({ locale }) => {
  if (!locale) {
    // `next/root-params` está activo por defecto desde Next 16.3 y NO funciona en
    // Route Handlers ni Server Actions (docs/research/evidence-log.md E-10).
    const paramValue = await rootParams.locale();
    if (hasLocale(routing.locales, paramValue)) {
      locale = paramValue;
    } else {
      notFound();
    }
  }

  return {
    locale,
    // Solo se carga el archivo del idioma activo: cada locale es su propio chunk.
    messages: (
      (await import(`../../messages/${locale}.json`)) as { default: Record<string, unknown> }
    ).default,
    // Los horarios y eventos locales usan America/Panama, no la zona del visitante.
    timeZone: PANAMA_TIME_ZONE,
    onError(error) {
      console.error(error);
    },
    getMessageFallback({ namespace, key }) {
      // Visible a propósito: una clave ausente nunca debe pasar inadvertida (hay prueba de paridad).
      return `⚠ ${namespace ? `${namespace}.` : ''}${key}`;
    },
  };
});
