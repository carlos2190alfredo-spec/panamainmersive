import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { assertLocale, type LocaleParams } from '@/lib/params';

// Cualquier ruta desconocida dentro de un idioma válido muestra el 404 LOCALIZADO
// (sin este captador, Next usaría un 404 genérico fuera del layout del idioma).

/**
 * Título propio de la 404 también AQUÍ (r0:F-10, WCAG 2.4.2). `not-found.tsx` lo exporta y el HTML del servidor lo trae, pero
 * tras la hidratación el enrutador del cliente vuelve a calcular la cabecera a partir de la RUTA (esta página) y lo sustituía
 * por el título del sitio: la pestaña decía «Página no encontrada» un segundo y luego «Panamá Immersive».
 */
export async function generateMetadata({ params }: LocaleParams): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  const t = await getTranslations({ locale, namespace: 'Meta' });
  return { title: t('notFound.title') };
}

export default function CatchAll() {
  notFound();
}
