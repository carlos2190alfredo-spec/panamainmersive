import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ContentSections } from '@/components/content/ContentSections';
import { buildContentView } from '@/domains/content/completeness';
import type { AssertionRecord, FieldNotice } from '@/domains/content/assertion';
import { formatElevation } from '@/i18n/format';
import { LOCALES, type Locale } from '@/i18n/locales';
import {
  TODAY,
  assertion,
  elevation,
  entryRules,
  evidence,
  original,
  translation,
} from '../domains/content/fixtures';

const messages = Object.fromEntries(
  LOCALES.map((l) => [
    l,
    JSON.parse(readFileSync(join(process.cwd(), 'messages', `${l}.json`), 'utf8')) as Record<
      string,
      unknown
    >,
  ]),
) as Record<Locale, Record<string, unknown>>;

function render(
  assertions: AssertionRecord[],
  notices: FieldNotice[],
  locale: Locale,
  opts: { kind?: 'locality' | 'volcano'; generatedAt?: string | null } = {},
): string {
  const view = buildContentView(assertions, notices, opts.kind ?? 'locality', locale, TODAY);
  return renderToStaticMarkup(
    <NextIntlClientProvider locale={locale} messages={messages[locale]}>
      <ContentSections view={view} locale={locale} generatedAt={opts.generatedAt ?? null} />
    </NextIntlClientProvider>,
  );
}

describe('ficha: sin contenido verificado', () => {
  it('lo dice con palabras, lista lo que falta y no muestra ninguna fuente ni afirmación', () => {
    const html = render([], [], 'es');
    expect(html).toContain('todavía no está redactada');
    expect(html).toContain('Sin datos verificados todavía');
    expect(html).toContain('no significa que no exista');
    for (const label of ['Resumen', 'Cómo llegar', 'Reglas de entrada', 'Riesgos y seguridad']) {
      expect(html).toContain(label);
    }
    expect(html).not.toContain('<article');
    expect(html).not.toContain('Verificado el');
    expect(html).not.toContain('<a ');
    expect(html).not.toContain('Contenido del sitio actualizado');
  });

  it('un volcán incluye la altitud entre lo no verificado; una localidad no', () => {
    expect(render([], [], 'es', { kind: 'volcano' })).toContain('Altitud');
    expect(render([], [], 'es')).not.toContain('Altitud');
  });
});

describe('ficha: contenido verificado', () => {
  it('muestra el texto, la fecha de verificación, la confianza y las fuentes con enlaces seguros', () => {
    const html = render([assertion({ confidence: 'high' })], [], 'es');
    expect(html).toContain('<article');
    expect(html).toContain('[prueba] texto original');
    // con contenido verificado no se dice que la ficha esté sin redactar, ni se marca como traducido lo que es el original
    expect(html).not.toContain('todavía no está redactada');
    expect(html).not.toContain('Traducción revisada');
    expect(html).toContain('Verificado el');
    expect(html).toContain('Confianza: alta');
    expect(html).toContain('Fuentes');
    expect(html).toContain('href="https://example.org/doc"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('(se abre en una pestaña nueva)');
    expect(html).toContain('Licencia de prueba');
    expect(html).toContain('Institución de prueba');
    // lo verificado no figura en la lista de lo desconocido
    expect(html).toContain('Sin datos verificados todavía');
    expect(html.split('Sin datos verificados todavía')[1]).not.toContain('Resumen');
  });

  it('la vigencia se muestra cuando existe y no se inventa cuando no', () => {
    const withValidity = render([entryRules({ validUntil: '2027-03-01' })], [], 'es');
    expect(withValidity).toContain('Vigente hasta el 1 de marzo de 2027');
    expect(render([assertion()], [], 'es')).not.toContain('Vigente hasta');
  });

  it('una fuente con enlace no seguro hace que la afirmación ni siquiera se muestre como verificada (las puertas)', () => {
    for (const url of [
      'javascript:alert(1)',
      'http://example.org/x',
      'data:text/html,hola',
      'no es url',
    ]) {
      const html = render([assertion({ evidence: [evidence({ url })] })], [], 'es');
      expect(html, url).not.toContain('<article');
      expect(html, url).not.toContain(url);
    }
  });

  it('y si aun así llegara un enlace no seguro a la vista, el componente no lo convierte en enlace (defensa en profundidad)', () => {
    const base = buildContentView([assertion()], [], 'locality', 'es', TODAY);
    const item = base.verified[0];
    if (!item) throw new Error('sin ítem');
    for (const url of [
      'javascript:alert(1)',
      'http://example.org/x',
      'data:text/html,hola',
      'no es url',
    ]) {
      const view = {
        ...base,
        verified: [{ ...item, sources: [{ ...item.sources[0], url }] }],
      } as unknown as typeof base;
      const html = renderToStaticMarkup(
        <NextIntlClientProvider locale="es" messages={messages.es}>
          <ContentSections view={view} locale="es" generatedAt={null} />
        </NextIntlClientProvider>,
      );
      expect(html, url).not.toContain('<a ');
      expect(html, url).not.toContain(url);
      expect(html, url).toContain('Documento de prueba');
    }
  });

  it('el texto se escapa: nada de HTML ni scripts desde los datos', () => {
    const html = render(
      [
        assertion({
          texts: [original({ text: '<script>alert(1)</script><img src=x onerror=alert(1)>' })],
        }),
      ],
      [],
      'es',
    );
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;');
  });

  it('la fecha de verificación se muestra en la zona de Panamá (una verificación nocturna no salta de día)', () => {
    // 2026-10-02T03:00Z = 1 de octubre, 22:00 en Panamá
    const html = render(
      [
        assertion({
          verifiedAt: '2026-10-02T03:00:00Z',
          evidence: [evidence({ retrievedAt: '2026-09-20T12:00:00Z' })],
        }),
      ],
      [],
      'es',
    );
    expect(html).toContain('Verificado el 1 de octubre de 2026');
  });

  it('una cantidad se muestra con su unidad, formateada para el idioma, sin convertir', () => {
    for (const locale of LOCALES) {
      const html = render([elevation()], [], locale, { kind: 'volcano' });
      // El párrafo del valor es EXACTAMENTE la altitud métrica del idioma: ni pies ni otra conversión
      const value = /<p class="[^"]*value[^"]*">([^<]*)<\/p>/.exec(html)?.[1];
      expect(value).toBe(formatElevation(locale, 3475, 'metric'));
      expect(value).not.toBe(formatElevation(locale, 3475, 'imperial'));
    }
  });

  it('la fecha de exportación del contenido solo aparece si existe, y dice de QUÉ es la fecha', () => {
    expect(render([assertion()], [], 'es', { generatedAt: '2026-10-21T12:00:00.000Z' })).toContain(
      'Contenido del sitio actualizado por última vez el 21 de octubre de 2026',
    );
    expect(render([assertion()], [], 'es', { generatedAt: null })).not.toContain(
      'Contenido del sitio actualizado',
    );
  });

  it('un destino SIN nada que decir no muestra la fecha de exportación de todo el sitio (no es suya)', () => {
    // La instantánea es una sola para todo el sitio: su fecha cambia con cada exportación aunque este destino no.
    const html = render([], [], 'es', { generatedAt: '2026-10-21T12:00:00.000Z' });
    expect(html).toContain('todavía no está redactada');
    expect(html).not.toContain('Contenido del sitio actualizado');
    // Con un aviso (vencido o en disputa) sí hay algo publicado sobre el destino
    const disputed: FieldNotice = {
      destinationKey: 'boquete',
      fieldKey: 'safety.hazards',
      state: 'DISPUTED',
    };
    expect(render([], [disputed], 'es', { generatedAt: '2026-10-21T12:00:00.000Z' })).toContain(
      'Contenido del sitio actualizado por última vez el 21 de octubre de 2026',
    );
  });

  it.each(LOCALES)(
    '%s: la línea de confianza usa la puntuación del idioma (en francés, espacio duro antes de «:»)',
    (locale) => {
      const html = render([assertion({ confidence: 'medium' })], [], locale);
      const meta = [...html.matchAll(/<p class="[^"]*meta[^"]*">([^<]*)<\/p>/g)]
        .map((m) => m[1] ?? '')
        .find((line) => line.includes(' · '));
      expect(meta, locale).toBeDefined();
      const expected = {
        es: 'Confianza: media',
        en: 'Confidence: medium',
        pt: 'Confiança: média',
        fr: 'Fiabilité\u00a0: moyenne',
        de: 'Verlässlichkeit: mittel',
      }[locale];
      expect(meta, locale).toContain(expected);
    },
  );
});

describe('ficha: idioma sin fingir traducción', () => {
  it('sin traducción se muestra el original, se dice por qué y se marca el idioma del texto', () => {
    const html = render([assertion()], [], 'en');
    expect(html).toContain(
      'Showing the original text in Spanish: there is no translation into this language yet.',
    );
    expect(html).not.toContain('Español');
    expect(html).toContain('lang="es"');
    expect(html).toContain('[prueba] texto original');
    expect(html).not.toContain('Translation reviewed by a person.');
  });

  it.each([
    ['draft', 'there is no reviewed and published translation yet'],
    ['machine_translated', 'there is no reviewed and published translation yet'],
    // «reviewed» SÍ está revisada, pero no publicada: la razón no puede decir que nadie la revisó
    ['reviewed', 'there is no reviewed and published translation yet'],
    ['outdated', 'is out of date'],
  ] as const)('una traducción «%s» NO se muestra', (status, reason) => {
    const html = render(
      [
        assertion({
          texts: [
            original(),
            translation({
              status,
              provenance: status === 'machine_translated' ? 'ai_translation' : 'human_translation',
            }),
          ],
        }),
      ],
      [],
      'en',
    );
    expect(html).not.toContain('[test] original text');
    expect(html).toContain(reason);
    expect(html).toContain('[prueba] texto original');
  });

  it.each([
    ['en', 'Showing the original text in Spanish: there is no translation into this language yet.'],
    [
      'pt',
      'Exibindo o texto original em espanhol: ainda não existe uma tradução para este idioma.',
    ],
    ['fr', 'Texte original affiché en espagnol\u00a0: il n’existe pas encore de traduction'],
    ['de', 'Der Originaltext wird auf Spanisch angezeigt: Es gibt noch keine Übersetzung'],
  ] as const)(
    '%s: el idioma del original (español) se nombra en el idioma de la interfaz, dentro de una frase correcta',
    (locale, expected) => {
      const html = render([assertion()], [], locale);
      expect(html).toContain(expected);
      expect(html).not.toContain('Español'); // el endónimo no se incrusta en una frase de otro idioma
    },
  );

  it('una afirmación cuyo original está en inglés se nombra «inglés» en español, sin endónimo', () => {
    const html = render(
      [
        assertion({
          sourceLocale: 'en',
          texts: [original({ locale: 'en', text: '[test] source' })],
        }),
      ],
      [],
      'es',
    );
    expect(html).toContain('Se muestra el texto original en inglés:');
    expect(html).not.toContain('English');
    expect(html).toContain('lang="en"');
  });

  it('una traducción humana publicada se muestra y se declara revisada', () => {
    const html = render([assertion({ texts: [original(), translation()] })], [], 'en');
    expect(html).toContain('[test] original text');
    expect(html).toContain('Translation reviewed by a person.');
    expect(html).not.toContain('Showing the original text');
    expect(html).toContain('lang="en"');
  });
});

describe('ficha: vencido y en disputa', () => {
  const expired: FieldNotice = {
    destinationKey: 'boquete',
    fieldKey: 'restrictions.entry_rules',
    state: 'EXPIRED',
    verifiedAt: '2026-01-01T00:00:00Z',
    validUntil: '2026-06-01',
  };
  const disputed: FieldNotice = {
    destinationKey: 'boquete',
    fieldKey: 'safety.hazards',
    state: 'DISPUTED',
  };

  it('avisa del vencimiento y de la disputa por campo, sin contenido, y no los lista como «sin investigar»', () => {
    const html = render([], [expired, disputed], 'es');
    expect(html).toContain(
      'Reglas de entrada: la información verificada venció el 1 de junio de 2026',
    );
    expect(html).toContain('Riesgos y seguridad: hay información contradictoria en revisión');
    // La sección de desconocidos DEBE existir (si desapareciera, `not.toContain` sobre '' pasaría sin probar nada)
    expect(html).toContain('Sin datos verificados todavía');
    const unknownPart = html.split('Sin datos verificados todavía')[1] ?? '';
    expect(unknownPart.length).toBeGreaterThan(0);
    expect(unknownPart).toContain('Resumen'); // control positivo: sí lista lo que no se investigó
    expect(unknownPart).not.toContain('Reglas de entrada');
    expect(unknownPart).not.toContain('Riesgos y seguridad');
  });

  it.each(LOCALES)(
    '%s: con solo campos vencidos o en disputa NO se dice que la ficha «no está redactada» (se contradice con los avisos)',
    (locale) => {
      const pending = (messages[locale].Destinations as { contentPending: string }).contentPending;
      for (const [assertions, notices] of [
        [[], [expired]],
        [[], [disputed]],
        [[], [expired, disputed]],
        [[entryRules({ validUntil: '2026-10-01' })], []], // venció por fecha: el estado se deriva
      ] as [AssertionRecord[], FieldNotice[]][]) {
        const html = render(assertions, notices, locale);
        expect(html, locale).not.toContain(pending);
        expect(html, locale).toContain('<div'); // sigue habiendo un aviso
      }
      // y el estado realmente vacío sí lo dice
      expect(render([], [], locale)).toContain(pending);
    },
  );

  it('una afirmación que venció por fecha tampoco muestra su contenido', () => {
    const html = render([entryRules({ validUntil: '2026-10-01' })], [], 'es');
    expect(html).toContain('venció el 1 de octubre de 2026');
    expect(html).not.toContain('[prueba] texto original');
  });
});

describe('ficha en los cinco idiomas', () => {
  it.each(LOCALES)(
    '%s: renderiza todo sin claves faltantes ni marcadores sin resolver',
    (locale) => {
      const html = render(
        [
          assertion({ texts: [original(), translation({ locale: 'fr', text: '[test] fr' })] }),
          entryRules({ id: '9f5a1e74-3c6d-4b8a-8d43-6e1c2a7b9f32' }),
        ],
        [
          { destinationKey: 'boquete', fieldKey: 'safety.hazards', state: 'DISPUTED' },
          {
            destinationKey: 'boquete',
            fieldKey: 'access.how_to_get_there',
            state: 'EXPIRED',
            verifiedAt: '2026-01-01T00:00:00Z',
            validUntil: '2026-06-01',
          },
        ],
        locale,
        { generatedAt: '2026-10-21T12:00:00.000Z' },
      );
      expect(html).not.toMatch(/Content\.|Destinations\.|Common\./); // clave sin resolver
      expect(html).not.toMatch(/\{[a-z]+\}/); // marcador ICU sin sustituir
      expect(html).not.toContain('undefined');
      expect(html).not.toContain('NaN');
      expect(html).toContain('<article');
    },
  );
});
