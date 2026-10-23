"""
Mutaciones de TypeScript de la ruta de producción del contenido (instantánea → estado → ficha/sitemap) contra la suite
unitaria completa. Uso:  python3 scripts/mutation/ts.py [ID …]
Etiquetas: S = estado derivado, L = cargador, O = SEO (destinationSeo), X = texto por idioma, M = sitemap,
I = idioma de las fuentes (etiqueta, instantánea, ficha).
"""
import sys
from lib import main, run_vitest

ST='src/domains/content/state.ts'; LD='src/lib/content-snapshot.ts'; DC='src/lib/destination-content.ts'
TX='src/domains/content/text.ts'; SM='src/app/sitemap.ts'; CP='src/domains/content/completeness.ts'
LT='src/domains/content/language-tag.ts'; SN='src/domains/content/snapshot.ts'; CS='src/components/content/ContentSections.tsx'
LTAG="LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$/;"
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
 ('I1 etiqueta de idioma: sin ancla de inicio',LT,LTAG,"LANGUAGE_TAG = /[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$/;"),
 ('I2 etiqueta de idioma: sin ancla de fin',LT,LTAG,"LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?/;"),
 ('I3 etiqueta de idioma: escritura en minúsculas',LT,LTAG,"LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Za-z]{4})?(-([A-Z]{2}|[0-9]{3}))?$/;"),
 ('I4 etiqueta de idioma: región en minúsculas',LT,LTAG,"LANGUAGE_TAG = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Za-z]{2}|[0-9]{3}))?$/;"),
 ('I5 etiqueta de idioma: idioma de hasta 8 letras',LT,LTAG,"LANGUAGE_TAG = /^[a-z]{2,8}(-[A-Z][a-z]{3})?(-([A-Z]{2}|[0-9]{3}))?$/;"),
 ('I6 isLanguageTag acepta lo que no es una cadena',LT,"typeof value === 'string' && LANGUAGE_TAG.test(value)","LANGUAGE_TAG.test(String(value))"),
 ('I7 instantánea: el idioma no se valida',SN,"language: z.string().regex(LANGUAGE_TAG).nullable(),","language: z.string().nullable(),"),
 ('I8 instantánea: el idioma desconocido (null) se rechaza',SN,"language: z.string().regex(LANGUAGE_TAG).nullable(),","language: z.string().regex(LANGUAGE_TAG),"),
 ('I9 instantánea: la forma anterior (sin `language`) se acepta',SN,"language: z.string().regex(LANGUAGE_TAG).nullable(),","language: z.string().regex(LANGUAGE_TAG).nullish(),"),
 ('I10 fuentes sin idioma: se cuentan las que SÍ lo declaran',SN,"if (evidence.language === null) urls.add(evidence.url);","if (evidence.language !== null) urls.add(evidence.url);"),
 ('I11 fuentes sin idioma: se cuenta por evidencia, no por enlace',SN,"if (evidence.language === null) urls.add(evidence.url);","if (evidence.language === null) urls.add(evidence.id);"),
 ('I12 ficha: el enlace de la fuente sin lang',CS,"<a href={href} lang={language} rel=","<a href={href} rel="),
 ('I13 ficha: un idioma malformado llega al atributo',CS,"const language = isLanguageTag(source.language) ? source.language : undefined;","const language = source.language ?? undefined;"),
 ('I14 ficha: la institución sin lang',CS,"{inSourceLanguage(source.institution)}","{source.institution}"),
 ('I15 ficha: la licencia sin lang',CS,"license: source.license.name,\n                  doc: inSourceLanguage,\n","license: source.license.name,\n"),
 ('I16 ficha: el localizador sin lang',CS,"t.rich('locator', { locator: source.locator, doc: inSourceLanguage })","t.rich('locator', { locator: source.locator, doc: (chunks) => chunks })"),
 ('I17 ficha: el título sin enlace seguro sin lang',CS,"<span lang={language}>{source.title}</span>","<span>{source.title}</span>"),
 ('I18 ficha: el aviso «pestaña nueva» no vuelve al idioma de la interfaz',CS,"lang={language ? LOCALE_INFO[locale].htmlLang : undefined}","lang={undefined}"),
]

if __name__ == "__main__":
    sys.exit(main(MUTS, lambda: run_vitest("unit"), sys.argv[1:], min_base=700))
