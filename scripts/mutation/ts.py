"""
Mutaciones de TypeScript de la ruta de producción del contenido (instantánea → estado → ficha/sitemap) contra la suite
unitaria completa. Uso:  python3 scripts/mutation/ts.py [ID …]
Etiquetas: S = estado derivado, L = cargador, O = SEO (destinationSeo), X = texto por idioma, M = sitemap.
"""
import sys
from lib import main, run_vitest

ST='src/domains/content/state.ts'; LD='src/lib/content-snapshot.ts'; DC='src/lib/destination-content.ts'
TX='src/domains/content/text.ts'; SM='src/app/sitemap.ts'; CP='src/domains/content/completeness.ts'
MUTS=[
 ('S1 estado: exige identidades que la instantánea no lleva',ST,"passesGates(a, kind, { people: 'unavailable' })","passesGates(a, kind, { people: 'required' })"),
 ('S2 aviso EXPIRED de otro campo',ST,"notices.find((n) => n.fieldKey === field.key && n.state === 'EXPIRED')","notices.find((n) => n.state === 'EXPIRED')"),
 ('S3 aviso DISPUTED de otro campo',ST,"notices.some((n) => n.fieldKey === field.key && n.state === 'DISPUTED')","notices.some((n) => n.state === 'DISPUTED')"),
 ('S4 el último día de vigencia ya vence',ST,"today > current.validUntil","today >= current.validUntil"),
 ('S5 disputa de una versión ya reemplazada',ST,"a.status === 'disputed' && a.supersededAt === null && a.version","a.status === 'disputed' && a.version"),
 ('S6 vigente = la versión MÁS ANTIGUA',ST,".sort((a, b) => b.version - a.version)[0]",".sort((a, b) => a.version - b.version)[0]"),
 ('L1 contentFor no filtra afirmaciones por destino',LD,"RECORDS.filter((a) => a.destinationKey === key)","RECORDS"),
 ('L2 contentFor no filtra avisos por destino',LD,"PUBLISHED_CONTENT.notices.filter((n) => n.destinationKey === key)","PUBLISHED_CONTENT.notices"),
 ('L3 el cargador no valida (se salta las puertas)',LD,"export const PUBLISHED_CONTENT = parseSnapshot(raw);","export const PUBLISHED_CONTENT = raw as unknown as ReturnType<typeof parseSnapshot>;"),
 ('L4 el cargador traga el error y publica vacío',LD,"export const PUBLISHED_CONTENT = parseSnapshot(raw);","export const PUBLISHED_CONTENT = (() => { try { return parseSnapshot(raw); } catch { return { schema: 1 as const, generatedAt: null, assertions: [], notices: [] }; } })();"),
 ('O1 estado SEO siempre draft',DC,"statusFor: (locale) =>\n      weakestStatus(UI_TRANSLATION_STATUS[locale], contentStatusFor(views[locale])),","statusFor: () => 'draft' as const,"),
 ('O2 estado SEO ignora la interfaz',DC,"weakestStatus(UI_TRANSLATION_STATUS[locale], contentStatusFor(views[locale]))","contentStatusFor(views[locale])"),
 ('O3 estado SEO ignora el contenido',DC,"weakestStatus(UI_TRANSLATION_STATUS[locale], contentStatusFor(views[locale]))","UI_TRANSLATION_STATUS[locale]"),
 ('O4 campos mínimos siempre',DC,"hasRequiredFields: (locale) => hasRequiredFields(views[locale]),","hasRequiredFields: () => true,"),
 ('O5 sensibilidad siempre general',DC,"sensitivity: pageSensitivity(Object.values(views)),","sensitivity: 'general' as const,"),
 ('X1 texto: «idioma del original» siempre es',TX,"if (locale === assertion.sourceLocale) {","if (locale === 'es') {"),
 ('X2 original: siempre en español',TX,"v.locale === a.sourceLocale && v.provenance === 'original'","v.locale === 'es' && v.provenance === 'original'"),
 ('X3 fallback: el original que se muestra siempre es es',TX,"return { kind: 'original_fallback', locale: original.locale,","return { kind: 'original_fallback', locale: 'es' as const,"),
 ('M1 sitemap: sin el cableado de indexación',SM,'      ...indexingOf(seo),\n','      hasRequiredFields: true,\n'),
 ('M2 indexingOf: estado siempre publicado',DC,"  statusFor: seo.statusFor,\n  sensitivity: seo.sensitivity,\n});","  statusFor: () => 'published' as const,\n  sensitivity: seo.sensitivity,\n});"),
 ('M3 indexingOf: sensibilidad siempre general',DC,"  sensitivity: seo.sensitivity,\n});","  sensitivity: 'general' as const,\n});"),
 ('M4 sitemap: contenido de otro destino',SM,"destinationSeo(contentFor(d.key), d.kind, today)","destinationSeo(contentFor(DESTINATIONS[0]!.key), d.kind, today)"),
 ('M5 sitemap: sin la fecha de hoy (congelada)',SM,"const today = getTodayIsoDate();","const today = '2000-01-01';"),
]

if __name__ == "__main__":
    sys.exit(main(MUTS, lambda: run_vitest("unit"), sys.argv[1:], min_base=700))
