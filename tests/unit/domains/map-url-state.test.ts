import { describe, expect, it } from 'vitest';
import { DESTINATION_KEYS } from '@/domains/tourism/destinations';
import {
  DEFAULT_MAP_LAYERS,
  MAP_LAYER_IDS,
  applyMapUrlState,
  formatCamera,
  paramsFromSearch,
  parseCamera,
  parseLayers,
  parseMapUrlState,
  serializeMapUrlState,
} from '@/domains/geography/map-url-state';

describe('estado del mapa en la URL', () => {
  it('acepta todas las claves estables de destino', () => {
    for (const key of DESTINATION_KEYS) {
      expect(parseMapUrlState({ d: key })).toEqual({ state: { destination: key }, issues: [] });
    }
  });

  it('rechaza nombres, slugs traducidos y claves ajenas (la URL usa la clave estable)', () => {
    for (const d of [
      'Boquete',
      'volcán-baru',
      'Volcán Barú',
      'panamakanal',
      '__proto__',
      'constructor',
      '',
      'boquete ',
    ]) {
      const parsed = parseMapUrlState({ d });
      expect(parsed.state.destination, d).toBeUndefined();
      expect(parsed.issues, d).toEqual(['invalid-destination']);
    }
  });

  it('cámara válida: normaliza rumbo y alabeo', () => {
    expect(parseCamera('-79.5342,8.9714,12000,370,45,190')).toEqual({
      lon: -79.5342,
      lat: 8.9714,
      altitudeM: 12000,
      headingDeg: 10,
      pitchDeg: 45,
      rollDeg: -170,
    });
  });

  it.each([
    ['faltan campos', '1,2,3'],
    ['sobran campos', '1,2,3,4,5,6,7'],
    ['NaN', '-79.5,8.9,NaN,0,0,0'],
    ['Infinity', '-79.5,8.9,Infinity,0,0,0'],
    ['notación científica', '-79.5,8.9,1e3,0,0,0'],
    ['signo +', '+79.5,8.9,1000,0,0,0'],
    ['espacios', '-79.5, 8.9,1000,0,0,0'],
    ['vacío', ''],
    ['altitud 0', '-79.5,8.9,0,0,0,0'],
    ['altitud negativa', '-79.5,8.9,-5,0,0,0'],
    ['altitud excesiva', '-79.5,8.9,10000001,0,0,0'],
    ['pitch > 85', '-79.5,8.9,1000,0,86,0'],
    ['pitch negativo', '-79.5,8.9,1000,0,-1,0'],
    ['lat > 85', '-79.5,86,1000,0,0,0'],
    ['lon > 180', '181,8.9,1000,0,0,0'],
    ['hexadecimal', '0x10,8.9,1000,0,0,0'],
    ['cadena enorme', `${'1'.repeat(300)},8.9,1000,0,0,0`],
  ])('cámara inválida: %s', (_name, raw) => {
    expect(parseCamera(raw)).toBeNull();
    expect(parseMapUrlState({ c: raw })).toEqual({ state: {}, issues: ['invalid-camera'] });
  });

  it('formatCamera redondea, no produce «-0», «360» ni notación científica', () => {
    const text = formatCamera({
      lon: -79.534_219_9,
      lat: 8.971_449_2,
      altitudeM: 0.04,
      headingDeg: -0.01,
      pitchDeg: 0,
      rollDeg: 0,
    });
    // altitud mínima 0,1 m (cero no es una cámara válida); −0,01° de rumbo es 0 y no 360.
    expect(text).toBe('-79.53422,8.97145,0.1,0,0,0');
    expect(
      formatCamera({
        lon: 0,
        lat: 0,
        altitudeM: 5,
        headingDeg: 359.96,
        pitchDeg: 0,
        rollDeg: -0.04,
      }),
    ).toBe('0,0,5,0,0,0');
    expect(
      formatCamera({ lon: 0, lat: 0, altitudeM: 5, headingDeg: 0, pitchDeg: 0, rollDeg: -179.96 }),
    ).toBe('0,0,5,0,0,180');
    const text2 = formatCamera({
      lon: -82.4348,
      lat: 8.7764,
      altitudeM: 3500.26,
      headingDeg: 20.04,
      pitchDeg: 60,
      rollDeg: 0,
    });
    expect(text2).toBe('-82.4348,8.7764,3500.3,20,60,0');
  });

  it('propiedad: lo serializado SIEMPRE se reanaliza y es canónico (idempotente), incluso con entradas extremas', () => {
    // PRNG determinista (mulberry32): la prueba es reproducible.
    let seed = 0x9e3779b9;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const between = (lo: number, hi: number) => lo + (hi - lo) * rand();
    for (let i = 0; i < 2000; i++) {
      const camera = {
        lon: between(-540, 540),
        lat: between(-95, 95),
        altitudeM: 10 ** between(-3, 8),
        headingDeg: between(-720, 720),
        pitchDeg: between(-5, 90),
        rollDeg: between(-540, 540),
      };
      const text = formatCamera(camera);
      const parsed = parseCamera(text);
      expect(parsed, text).not.toBeNull();
      expect(text).not.toMatch(/e/i);
      expect(formatCamera(parsed!), text).toBe(text);
    }
  });

  it('capas: orden canónico, sin duplicados, desconocidas descartadas e informadas', () => {
    expect(parseLayers('terrain3d,protectedAreas,terrain3d')).toEqual({
      layers: ['protectedAreas', 'terrain3d'],
      unknown: false,
    });
    expect(parseLayers('hillshade,<script>,')).toEqual({ layers: ['hillshade'], unknown: true });
    expect(parseLayers('')).toEqual({ layers: [], unknown: false });
    expect(parseLayers('x'.repeat(500)).unknown).toBe(true);
  });

  it('`l` vacío significa «ninguna capa»; ausente significa «las de por defecto»', () => {
    expect(parseMapUrlState({ l: '' }).state.layers).toEqual([]);
    expect(parseMapUrlState({}).state.layers).toBeUndefined();
    expect(DEFAULT_MAP_LAYERS.every((id) => MAP_LAYER_IDS.includes(id))).toBe(true);
    // Privacidad: ninguna capa que cargue datos de terceros está activa por defecto.
    expect(DEFAULT_MAP_LAYERS).not.toContain('hillshade');
    expect(DEFAULT_MAP_LAYERS).not.toContain('terrain3d');
    expect(parseMapUrlState({ l: 'foo' })).toEqual({
      state: { layers: [] },
      issues: ['unknown-layers'],
    });
  });

  it('con parámetros repetidos (Next entrega arrays) usa el primero', () => {
    expect(parseMapUrlState({ d: ['boquete', 'coiba'] }).state.destination).toBe('boquete');
  });

  it('serializa y reanaliza sin pérdida', () => {
    const state = {
      destination: 'volcan-baru' as const,
      camera: {
        lon: -82.5424,
        lat: 8.8089,
        altitudeM: 9000,
        headingDeg: 20,
        pitchDeg: 55,
        rollDeg: 0,
      },
      layers: ['terrain3d', 'hillshade'] as const,
    };
    const ser = serializeMapUrlState(state);
    expect(ser).toEqual({
      d: 'volcan-baru',
      c: '-82.5424,8.8089,9000,20,55,0',
      l: 'hillshade,terrain3d',
    });
    const back = parseMapUrlState(ser);
    expect(back.issues).toEqual([]);
    expect(back.state).toEqual({ ...state, layers: ['hillshade', 'terrain3d'] });
  });

  it('applyMapUrlState conserva parámetros ajenos y sustituye solo d, c y l', () => {
    const search = new URLSearchParams('utm=x&d=coiba&c=1,2,3&l=hillshade&q=a%20b');
    const next = applyMapUrlState(search, { destination: 'boquete' });
    expect(next.get('utm')).toBe('x');
    expect(next.get('q')).toBe('a b');
    expect(next.get('d')).toBe('boquete');
    expect(next.has('c')).toBe(false);
    expect(next.has('l')).toBe(false);
    expect(applyMapUrlState(search, { layers: [] }).get('l')).toBe('');
    expect(search.get('d')).toBe('coiba'); // no muta la entrada
  });

  it('paramsFromSearch solo extrae los parámetros del mapa', () => {
    expect(paramsFromSearch(new URLSearchParams('d=coiba&zzz=1'))).toEqual({
      d: 'coiba',
      c: undefined,
      l: undefined,
    });
  });
});

describe('área seleccionada en la URL (`a`)', () => {
  const ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

  it('acepta un ID de Overture (UUID) y lo normaliza a minúsculas', () => {
    expect(parseMapUrlState({ a: ID.toUpperCase() })).toEqual({ state: { area: ID }, issues: [] });
  });

  it.each([
    'bocas-del-toro',
    'Parque Nacional Coiba',
    `${ID}'; drop table x;--`,
    '<img src=x onerror=alert(1)>',
    '',
    '../../etc/passwd',
    ID.slice(0, 35),
    'a'.repeat(5000),
  ])('descarta e informa «%s» (nunca se selecciona por nombre ni se corrige adivinando)', (a) => {
    expect(parseMapUrlState({ a })).toEqual({ state: {}, issues: ['invalid-area'] });
  });

  it('es independiente de destino, cámara y capas, y se serializa en el orden canónico', () => {
    const state = parseMapUrlState({ d: 'coiba', a: ID, l: 'protectedAreas' }).state;
    expect(state).toEqual({ destination: 'coiba', area: ID, layers: ['protectedAreas'] });
    expect(serializeMapUrlState(state)).toEqual({
      d: 'coiba',
      c: undefined,
      l: 'protectedAreas',
      a: ID,
    });
  });

  it('applyMapUrlState conserva lo ajeno y sustituye `a` (también la quita)', () => {
    const search = new URLSearchParams(`x=1&a=${ID}&d=coiba`);
    expect(applyMapUrlState(search, { area: ID.replace(/^3f/, '4f') }).toString()).toBe(
      `x=1&a=${ID.replace(/^3f/, '4f')}`,
    );
    expect(applyMapUrlState(search, {}).toString()).toBe('x=1');
  });

  it('un `area` que no es un UUID jamás llega a la URL (defensa también al escribir)', () => {
    expect(serializeMapUrlState({ area: 'no-es-un-uuid' }).a).toBeUndefined();
  });

  it('paramsFromSearch incluye `a`', () => {
    expect(paramsFromSearch(new URLSearchParams(`a=${ID}&z=1`)).a).toBe(ID);
  });
});
