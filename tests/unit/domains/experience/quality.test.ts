import { describe, expect, it } from 'vitest';
import {
  QUALITY_THRESHOLDS as T,
  qualityFromScratch,
  resolveQuality,
  type DeviceObservations,
  type Quality,
} from '@/domains/experience/quality';

const device = (over: Partial<DeviceObservations> = {}): DeviceObservations => ({
  saveData: false,
  frameTimeP75Ms: null,
  glContextLosses: 0,
  tileErrorRate: null,
  ...over,
});
const held = T.minHoldMs;

describe('calidad desde cero (sin memoria)', () => {
  it('sin medir nada es STANDARD: nunca se supone un equipo potente', () => {
    expect(qualityFromScratch(device())).toBe('STANDARD');
    // ni siquiera con una tasa de error perfecta: HIGH exige haber MEDIDO el frame
    expect(qualityFromScratch(device({ tileErrorRate: 0 }))).toBe('STANDARD');
  });

  it('el ahorro de datos manual y una pérdida de contexto gráfico dan LITE, midan lo que midan', () => {
    expect(qualityFromScratch(device({ saveData: true, frameTimeP75Ms: 8 }))).toBe('LITE');
    expect(qualityFromScratch(device({ glContextLosses: 1, frameTimeP75Ms: 8 }))).toBe('LITE');
  });

  it('el tiempo de frame decide entre los tres niveles, con los umbrales de entrada', () => {
    expect(qualityFromScratch(device({ frameTimeP75Ms: T.highEnterFrameMs }))).toBe('HIGH');
    expect(qualityFromScratch(device({ frameTimeP75Ms: T.highEnterFrameMs + 1 }))).toBe('STANDARD');
    expect(qualityFromScratch(device({ frameTimeP75Ms: T.liteEnterFrameMs - 1 }))).toBe('STANDARD');
    expect(qualityFromScratch(device({ frameTimeP75Ms: T.liteEnterFrameMs }))).toBe('LITE');
  });

  it('los errores de teselas también bajan la calidad y estorban a HIGH', () => {
    expect(
      qualityFromScratch(device({ frameTimeP75Ms: 10, tileErrorRate: T.highEnterErrorRate })),
    ).toBe('HIGH');
    expect(
      qualityFromScratch(
        device({ frameTimeP75Ms: 10, tileErrorRate: T.highEnterErrorRate + 0.001 }),
      ),
    ).toBe('STANDARD');
    expect(
      qualityFromScratch(device({ frameTimeP75Ms: 10, tileErrorRate: T.liteEnterErrorRate })),
    ).toBe('LITE');
  });
});

describe('los umbrales dejan una banda real entre entrar y salir (si no, la histéresis no existiría)', () => {
  it('entrar a HIGH es más exigente que salir, y salir de LITE más exigente que entrar', () => {
    expect(T.highEnterFrameMs).toBeLessThan(T.highExitFrameMs);
    expect(T.highExitFrameMs).toBeLessThan(T.liteExitFrameMs);
    expect(T.liteExitFrameMs).toBeLessThan(T.liteEnterFrameMs);
    expect(T.highEnterErrorRate).toBeLessThan(T.highExitErrorRate);
    expect(T.highExitErrorRate).toBeLessThan(T.liteExitErrorRate);
    expect(T.liteExitErrorRate).toBeLessThan(T.liteEnterErrorRate);
    expect(T.minHoldMs).toBeGreaterThan(0);
  });
});

describe('calidad con histéresis', () => {
  const q = (previous: Quality, heldMs: number, d: Partial<DeviceObservations>) =>
    resolveQuality(device(d), { quality: previous, heldMs });

  it('sin previa equivale a la calidad desde cero', () => {
    for (const f of [null, 5, 16, 20, 30, 40]) {
      expect(resolveQuality(device({ frameTimeP75Ms: f }))).toBe(
        qualityFromScratch(device({ frameTimeP75Ms: f })),
      );
    }
  });

  it('empeorar baja AL INSTANTE, sin esperar (HIGH puede saltar a LITE)', () => {
    expect(q('HIGH', 0, { frameTimeP75Ms: T.highExitFrameMs })).toBe('STANDARD');
    expect(q('HIGH', 0, { frameTimeP75Ms: T.liteEnterFrameMs })).toBe('LITE');
    expect(q('STANDARD', 0, { frameTimeP75Ms: T.liteEnterFrameMs })).toBe('LITE');
    expect(q('HIGH', 0, { tileErrorRate: T.highExitErrorRate, frameTimeP75Ms: 10 })).toBe(
      'STANDARD',
    );
  });

  it('el ahorro de datos y la pérdida de contexto bajan a LITE al instante desde cualquier nivel', () => {
    for (const previous of ['LITE', 'STANDARD', 'HIGH'] as const) {
      expect(q(previous, 0, { saveData: true, frameTimeP75Ms: 5 })).toBe('LITE');
      expect(q(previous, held, { glContextLosses: 2, frameTimeP75Ms: 5 })).toBe('LITE');
    }
  });

  it('mejorar exige aguantar: antes de `minHoldMs` no se sube, aunque las medidas sean buenas', () => {
    expect(q('STANDARD', held - 1, { frameTimeP75Ms: 8 })).toBe('STANDARD');
    expect(q('STANDARD', held, { frameTimeP75Ms: 8 })).toBe('HIGH');
    expect(q('LITE', held - 1, { frameTimeP75Ms: 8 })).toBe('LITE');
  });

  it('solo se sube UN nivel cada vez (LITE no salta a HIGH)', () => {
    expect(q('LITE', held, { frameTimeP75Ms: 5 })).toBe('STANDARD');
  });

  it('la banda impide oscilar: entre el umbral de salida y el de entrada se queda donde está', () => {
    // LITE: a 30 ms (entre 25 y 33) sigue en LITE aunque haya aguantado
    expect(q('LITE', held, { frameTimeP75Ms: 30 })).toBe('LITE');
    expect(q('LITE', held, { frameTimeP75Ms: T.liteExitFrameMs })).toBe('STANDARD');
    // STANDARD: a 28 ms no baja (el umbral es 33) y no sube
    expect(q('STANDARD', held, { frameTimeP75Ms: 28 })).toBe('STANDARD');
    // HIGH: a 20 ms (entre 16 y 24) se mantiene
    expect(q('HIGH', held, { frameTimeP75Ms: 20 })).toBe('HIGH');
  });

  it('los errores de teselas también mandan con memoria: bajan a LITE desde STANDARD y desde HIGH', () => {
    const bad = { frameTimeP75Ms: 10, tileErrorRate: T.liteEnterErrorRate };
    expect(q('STANDARD', 0, bad)).toBe('LITE');
    expect(q('HIGH', 0, bad)).toBe('LITE'); // salta, no pasa por STANDARD
    // justo por debajo del umbral de entrada a LITE, no
    expect(
      q('STANDARD', 0, { frameTimeP75Ms: 10, tileErrorRate: T.liteEnterErrorRate - 0.001 }),
    ).toBe('STANDARD');
  });

  it('subir a HIGH exige también pocos errores de teselas, no solo buen frame', () => {
    const ok = { frameTimeP75Ms: 8, tileErrorRate: T.highEnterErrorRate };
    expect(q('STANDARD', held, ok)).toBe('HIGH');
    expect(q('STANDARD', held, { ...ok, tileErrorRate: T.highEnterErrorRate + 0.01 })).toBe(
      'STANDARD',
    );
  });

  it('salir de LITE exige también que los errores de teselas hayan bajado al umbral de SALIDA', () => {
    const ok = { frameTimeP75Ms: 20, tileErrorRate: T.liteExitErrorRate };
    expect(q('LITE', held, ok)).toBe('STANDARD');
    expect(q('LITE', held, { ...ok, tileErrorRate: T.liteExitErrorRate + 0.01 })).toBe('LITE');
    // sin haber medido errores (null) no lo impide
    expect(q('LITE', held, { frameTimeP75Ms: 20, tileErrorRate: null })).toBe('STANDARD');
  });

  it('una medida que oscila alrededor de un umbral no hace oscilar la calidad', () => {
    // 100 muestras alternando 14 ↔ 22 ms (cruzan el umbral de ENTRADA a HIGH pero no el de salida)
    let quality: Quality = 'STANDARD';
    let heldMs = 0;
    const seen: Quality[] = [];
    for (let i = 0; i < 100; i += 1) {
      const next = q(quality, heldMs, { frameTimeP75Ms: i % 2 === 0 ? 14 : 22 });
      heldMs = next === quality ? heldMs + 1000 : 0;
      quality = next;
      seen.push(quality);
    }
    const changes = seen.filter((value, i) => i > 0 && value !== seen[i - 1]).length;
    // Sube a HIGH una vez (cuando ya aguantó) y ya no baja: 22 ms < 24 ms de salida.
    expect(changes).toBeLessThanOrEqual(1);
    expect(seen.at(-1)).toBe('HIGH');
  });
});
