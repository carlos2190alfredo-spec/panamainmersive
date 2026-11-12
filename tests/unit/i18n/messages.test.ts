import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { IntlMessageFormat } from 'intl-messageformat';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@/i18n/locales';

type Tree = { [key: string]: string | Tree };

function load(locale: Locale): Tree {
  return JSON.parse(
    readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8'),
  ) as Tree;
}

function flatten(tree: Tree, prefix = ''): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out.set(path, v);
    else for (const [p, s] of flatten(v, path)) out.set(p, s);
  }
  return out;
}

// Tipos del AST de ICU (intl-messageformat): 0 literal, 1 argumento, 2 número, 3 fecha,
// 4 hora, 5 select, 6 plural, 7 almohadilla, 8 etiqueta.
interface AstNode {
  type: number;
  value?: string;
  options?: Record<string, { value: AstNode[] }>;
  children?: AstNode[];
}

function argumentNames(nodes: AstNode[], into = new Set<string>()): Set<string> {
  for (const n of nodes) {
    if (n.type >= 1 && n.type <= 6 && typeof n.value === 'string') into.add(n.value);
    if (n.options) for (const o of Object.values(o_(n))) argumentNames(o.value, into);
    if (n.children) argumentNames(n.children, into);
  }
  return into;
}
const o_ = (n: AstNode) => n.options ?? {};

const source = flatten(load(DEFAULT_LOCALE));

describe('mensajes de interfaz en los cinco idiomas', () => {
  it('hay un archivo por idioma registrado', () => {
    expect(LOCALES).toEqual(['es', 'en', 'pt', 'fr', 'de']);
    for (const l of LOCALES) expect(() => load(l)).not.toThrow();
  });

  it.each(LOCALES.filter((l) => l !== DEFAULT_LOCALE))(
    '%s tiene exactamente las mismas claves que es (ni faltan ni sobran)',
    (locale) => {
      const keys = new Set(flatten(load(locale)).keys());
      const expected = new Set(source.keys());
      expect([...expected].filter((k) => !keys.has(k))).toEqual([]);
      expect([...keys].filter((k) => !expected.has(k))).toEqual([]);
    },
  );

  it.each(LOCALES)('%s: ningún mensaje vacío ni con espacios sobrantes', (locale) => {
    for (const [path, text] of flatten(load(locale))) {
      expect(text.trim(), path).not.toBe('');
      expect(text, path).toBe(text.trim());
    }
  });

  it.each(LOCALES)('%s: todos los mensajes son ICU válidos', (locale) => {
    for (const [path, text] of flatten(load(locale))) {
      expect(() => new IntlMessageFormat(text, locale), `${locale}:${path}`).not.toThrow();
    }
  });

  it.each(LOCALES.filter((l) => l !== DEFAULT_LOCALE))(
    '%s: los marcadores ({name}, {count}…) coinciden con es en cada mensaje',
    (locale) => {
      const messages = flatten(load(locale));
      for (const [path, text] of messages) {
        const base = source.get(path);
        if (base === undefined) continue;
        const a = [...argumentNames(new IntlMessageFormat(base, 'es').getAst())].sort();
        const b = [...argumentNames(new IntlMessageFormat(text, locale).getAst())].sort();
        expect(b, `${locale}:${path}`).toEqual(a);
      }
    },
  );

  // Coincidencias legítimas con el español (cada excepción se justifica; no se relaja el umbral).
  const IDENTICAL_TO_SPANISH_ALLOWED: Partial<Record<Locale, readonly string[]>> = {
    // «destino/destinos» se escribe igual en portugués y en español (también en el recuento de los
    // chips del filtro por tipo, Map.filter.count); «Mostrando {shown} de {total}.» también.
    // «Parada {number} de {total}» (las paradas de la travesía de la portada) también.
    pt: ['Explore.count', 'Map.inView.count', 'Map.filter.count', 'Home.travesia.stop'],
  };

  it.each(LOCALES.filter((l) => l !== DEFAULT_LOCALE))(
    '%s: no hay textos largos sin traducir (idénticos al español)',
    (locale) => {
      const messages = flatten(load(locale));
      const allowed = IDENTICAL_TO_SPANISH_ALLOWED[locale] ?? [];
      const untranslated = [...messages]
        .filter(
          ([path, text]) =>
            source.get(path) === text && text.length > 24 && !allowed.includes(path),
        )
        .map(([path]) => path);
      expect(untranslated).toEqual([]);
    },
  );

  it('el plural de «count» responde correctamente en cada idioma', () => {
    for (const locale of LOCALES) {
      const text = flatten(load(locale)).get('Explore.count');
      expect(text).toBeDefined();
      const f = new IntlMessageFormat(text ?? '', locale);
      expect(String(f.format({ count: 1 }))).toMatch(/1/);
      expect(String(f.format({ count: 9 }))).toMatch(/9/);
      expect(f.format({ count: 1 })).not.toEqual(f.format({ count: 9 }));
    }
  });

  // Plurales del buscador de la portada y de los filtros de Explorar: con 0, 1 y 9 el texto cambia
  // de forma y, cuando lleva «{query}», lo interpola tal cual (la consulta es entrada de la persona).
  const PLURALS_WITH_ZERO = ['Search.results', 'Map.filter.announce'] as const;
  const PLURALS_WITHOUT_ZERO = ['Map.filter.count', 'Map.search.count'] as const;

  it.each(LOCALES)('%s: los plurales de búsqueda y filtro responden con 0, 1 y 9', (locale) => {
    const messages = flatten(load(locale));
    const query = 'Boquete';
    for (const path of PLURALS_WITH_ZERO) {
      const text = messages.get(path);
      expect(text, `${locale}:${path}`).toBeDefined();
      const f = new IntlMessageFormat(text ?? '', locale);
      const out = [0, 1, 9].map((count) => String(f.format({ count, query })));
      expect(new Set(out).size, `${locale}:${path} distingue 0, 1 y 9`).toBe(3);
      expect(out[1], `${locale}:${path}`).toMatch(/1/);
      expect(out[2], `${locale}:${path}`).toMatch(/9/);
      // el caso 0 se escribe con palabras («ningún…»), no con la cifra
      expect(out[0], `${locale}:${path}`).not.toMatch(/\d/);
      if (path === 'Search.results') {
        for (const s of out) expect(s, `${locale}:${path}`).toContain(query);
      }
    }
    for (const path of PLURALS_WITHOUT_ZERO) {
      const text = messages.get(path);
      expect(text, `${locale}:${path}`).toBeDefined();
      const f = new IntlMessageFormat(text ?? '', locale);
      expect(String(f.format({ count: 1 })), `${locale}:${path}`).toMatch(/1/);
      expect(String(f.format({ count: 9 })), `${locale}:${path}`).toMatch(/9/);
      expect(f.format({ count: 1 }), `${locale}:${path}`).not.toEqual(f.format({ count: 9 }));
    }
  });
});

describe('textos que prometen algo comprobable (revisión independiente de 5j)', () => {
  const text = (locale: Locale, key: string): string => {
    const value = flatten(load(locale)).get(key);
    if (value === undefined) throw new Error(`falta ${locale}:${key}`);
    return value;
  };

  it('«Cambiar de idioma conserva…» NO dice que conserva los filtros: el filtro por tipo y la búsqueda de Explorar son estado local (r0:F-02)', () => {
    for (const locale of LOCALES) {
      const help = text(locale, 'Language.help');
      // lo que de verdad viaja en la URL: el destino, la vista del mapa y las capas activas
      expect(help, locale).not.toMatch(/filtr|filter|Filter/i);
      expect(help.length).toBeGreaterThan(30);
    }
    expect(text('es', 'Language.help')).toMatch(/destino.*vista del mapa.*capas/);
    expect(text('en', 'Language.help')).toMatch(/destination.*map view.*layers/);
    expect(text('pt', 'Language.help')).toMatch(/destino.*vista do mapa.*camadas/);
    expect(text('fr', 'Language.help')).toMatch(/destination.*vue de la carte.*couches/);
    expect(text('de', 'Language.help')).toMatch(/Reiseziel.*Kartenansicht.*Ebenen/);
  });

  it('el aviso previo de «Relieve en 3D» dice a quién llega la IP, en los cinco idiomas, y no es el aviso de estado (r3:F-01)', () => {
    for (const locale of LOCALES) {
      const before = text(locale, 'Map.tools.threeDNotice');
      const after = text(locale, 'Map.layers.thirdPartyNotice');
      expect(before, locale).toContain('Amazon Web Services');
      expect(before, locale).toMatch(/\bIP\b/);
      expect(before, locale).not.toBe(after);
      expect(before.length, locale).toBeLessThan(160); // cabe en un aviso de 17rem
    }
    // el aviso posterior se mantiene tal cual en los cinco idiomas
    for (const locale of LOCALES) {
      expect(text(locale, 'Map.layers.thirdPartyNotice'), locale).toContain('Amazon Web Services');
    }
  });

  it('la búsqueda no promete otros nombres: lo dice (r0:F-05)', () => {
    expect(text('es', 'Search.scope')).toMatch(/no reconoce otros nombres/);
    expect(text('en', 'Search.scope')).toMatch(/does not recognise other commonly used names/);
    expect(text('pt', 'Search.scope')).toMatch(/não reconhece outros nomes/);
    expect(text('fr', 'Search.scope')).toMatch(/ne reconnaît pas les autres noms/);
    expect(text('de', 'Search.scope')).toMatch(/andere gebräuchliche Namen erkennt sie nicht/);
  });

  it('el nombre del asa de la hoja lleva el título visible ({title}) en los cinco idiomas y NO el de Explorar a mano (r2:N2)', () => {
    for (const locale of LOCALES) {
      for (const key of ['Map.sheet.open', 'Map.sheet.close']) {
        const message = text(locale, key);
        expect(message, `${locale}:${key}`).toContain('{title}');
        expect(message.startsWith('{title}'), `${locale}:${key}`).toBe(true);
        expect(message, `${locale}:${key}`).not.toContain(text(locale, 'Explore.title'));
      }
    }
  });

  it('el rótulo de la insignia de geometría existe en los cinco idiomas (r0:F-01)', () => {
    const labels = LOCALES.map((l) => text(l, 'Coverage.geometryLabel'));
    expect(new Set(labels).size).toBe(5);
  });
});

describe('portada y textos de ayuda: nada promete lo que no existe y todo cabe (revisión independiente de 5j · X3)', () => {
  const text = (locale: Locale, key: string): string => {
    const value = flatten(load(locale)).get(key);
    if (value === undefined) throw new Error(`falta ${locale}:${key}`);
    return value;
  };

  // «organizar/planificar viajes» (r0:F-06): no hay planificador, itinerarios, cuentas ni listas (ADR-0025 §9)
  const PLANNING: Record<Locale, RegExp> = {
    es: /organizar|planificar|planear|itinerario|\bviajes?\b/i,
    en: /\bplan\b|\btrips?\b|itinerar|organi[sz]e/i,
    pt: /organizar|planejar|planear|roteiro|\bviagens?\b/i,
    fr: /organiser|planifier|\bvoyages?\b|itinéraire/i,
    de: /\bplanen\b|\bReisen\b|Reiseplan|organisieren/i,
  };

  it.each(LOCALES)(
    '%s: Home.lead y Meta.home.description no prometen organizar ni planificar viajes',
    (locale) => {
      for (const key of ['Home.lead', 'Meta.home.description']) {
        expect(text(locale, key), `${locale}:${key}`).not.toMatch(PLANNING[locale]);
      }
    },
  );

  it('control: la redacción de antes SÍ la detecta el filtro', () => {
    expect('Una plataforma para descubrir, comprender y organizar viajes por Panamá.').toMatch(
      PLANNING.es,
    );
    expect('A platform to discover, understand and plan trips across Panama.').toMatch(PLANNING.en);
    expect('Eine Plattform, um Reisen durch Panama zu entdecken und zu planen.').toMatch(
      PLANNING.de,
    );
  });

  it.each(LOCALES)(
    '%s: Home.lead dice lo que hay (descubrir y comprender a partir de fuentes abiertas) y muestra la procedencia',
    (locale) => {
      const lead = text(locale, 'Home.lead');
      expect(lead, locale).toMatch(/Panam/);
      // el lema NO se acompaña de afirmaciones nuevas: sigue siendo la frase del propietario, tal cual
      expect(text(locale, 'Brand.tagline').length).toBeGreaterThan(10);
      expect(lead).not.toContain(text(locale, 'Brand.tagline'));
    },
  );

  it.each(LOCALES)(
    '%s: el texto de ayuda del buscador de la portada es corto y sin recuento (cabe a 320 px sin recortarse)',
    (locale) => {
      const placeholder = text(locale, 'Search.placeholder');
      expect(placeholder.length, locale).toBeLessThanOrEqual(24);
      expect(placeholder, locale).not.toMatch(/\{|…|\.\.\./);
    },
  );

  it('alemán: «die ersten neun Reiseziele» (no el calco «die neun ersten») en todas las claves', () => {
    for (const key of [
      'Search.scope',
      'Meta.explore.description',
      'Meta.destinations.description',
    ]) {
      expect(text('de', key), key).not.toMatch(/neun ersten/);
    }
    expect(text('de', 'Search.scope')).toContain('die ersten neun Reiseziele');
  });

  it('«Volver a encuadrar el destino» no usa jerga de cámara en inglés, portugués ni alemán, y cabe en una línea', () => {
    expect(text('en', 'Map.featured.reframe')).not.toMatch(/reframe/i);
    expect(text('pt', 'Map.featured.reframe')).not.toMatch(/enquadrar/i);
    expect(text('de', 'Map.featured.reframe')).not.toMatch(/ausrichten/);
    for (const locale of LOCALES) {
      expect(text(locale, 'Map.featured.reframe').length, locale).toBeLessThanOrEqual(30);
    }
  });

  it('la zona de herramientas del mapa tiene UNA sola etiqueta: no queda una segunda clave con otro texto (Map.hud.toolsLabel era código muerto)', () => {
    for (const locale of LOCALES) {
      expect(flatten(load(locale)).has('Map.hud.toolsLabel'), locale).toBe(false);
      expect(text(locale, 'Map.tools.label').length).toBeGreaterThan(3);
    }
  });
});
