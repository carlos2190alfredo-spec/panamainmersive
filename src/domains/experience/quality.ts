/**
 * Calidad de la experiencia (docs/architecture.md §J, PROMPT-MAESTRO §10): `HIGH | STANDARD | LITE`, sin `ULTRA` hasta que
 * haya diferencias medibles. Se decide con OBSERVACIONES reales (tiempo de frame, pérdidas de contexto gráfico, errores de
 * teselas) y con el ahorro de datos que la persona activa a mano; **nunca** con APIs de memoria, temperatura o red que no
 * existan en todos los navegadores, y **nunca** se supone que un equipo es potente: sin medición, `STANDARD`.
 *
 * Con histéresis (una banda entre «entrar» y «salir» de un nivel y un tiempo mínimo antes de subir) para que la calidad
 * no oscile. Bajar es inmediato; subir exige aguantar. Función pura: el tiempo llega como parámetro (`heldMs`).
 */
export const QUALITIES = ['LITE', 'STANDARD', 'HIGH'] as const;
export type Quality = (typeof QUALITIES)[number];

/**
 * **PROPUESTA mía, sin validar** (F5-1): ningún umbral se midió en dispositivos reales (la única medición es M-06, móvil
 * emulado). Están aquí, en un solo sitio y nombrados, para que cambiarlos sea una decisión visible y no una búsqueda.
 */
export const QUALITY_THRESHOLDS = {
  /** p75 del tiempo de frame (ms) a partir del cual se baja a LITE (≈ 30 fps). */
  liteEnterFrameMs: 33,
  /** … y por debajo del cual se puede salir de LITE (la banda evita oscilar). */
  liteExitFrameMs: 25,
  /** Tasa de error de teselas a partir de la cual se baja a LITE, y por debajo de la cual se sale. */
  liteEnterErrorRate: 0.2,
  liteExitErrorRate: 0.1,
  /** p75 del tiempo de frame (ms) por debajo del cual se puede subir a HIGH (≈ 60 fps), y por encima del cual se sale. */
  highEnterFrameMs: 16,
  highExitFrameMs: 24,
  highEnterErrorRate: 0.02,
  highExitErrorRate: 0.05,
  /** Tiempo mínimo (ms) en el nivel actual antes de SUBIR de nivel. Bajar nunca espera. */
  minHoldMs: 15_000,
} as const;

export interface DeviceObservations {
  /** Ahorro de datos activado A MANO por la persona. */
  readonly saveData: boolean;
  /** p75 del tiempo de frame medido (ms); `null` si aún no se ha medido. */
  readonly frameTimeP75Ms: number | null;
  /** Pérdidas de contexto gráfico en esta sesión. */
  readonly glContextLosses: number;
  /** Fracción (0–1) de teselas con error; `null` si aún no hay peticiones. */
  readonly tileErrorRate: number | null;
}

export interface PreviousQuality {
  readonly quality: Quality;
  /** Cuánto lleva en ese nivel (ms). */
  readonly heldMs: number;
}

const T = QUALITY_THRESHOLDS;

function atOrAbove(value: number | null, limit: number): boolean {
  return value !== null && value >= limit;
}
function atOrBelow(value: number | null, limit: number): boolean {
  return value !== null && value <= limit;
}

/** Calidad sin memoria: lo que se elegiría de entrada. */
export function qualityFromScratch(d: DeviceObservations): Quality {
  if (d.saveData || d.glContextLosses > 0) return 'LITE';
  if (
    atOrAbove(d.frameTimeP75Ms, T.liteEnterFrameMs) ||
    atOrAbove(d.tileErrorRate, T.liteEnterErrorRate)
  )
    return 'LITE';
  // HIGH exige haber MEDIDO el frame: sin medición, nunca se supone un equipo potente.
  if (
    atOrBelow(d.frameTimeP75Ms, T.highEnterFrameMs) &&
    (d.tileErrorRate === null || d.tileErrorRate <= T.highEnterErrorRate)
  )
    return 'HIGH';
  return 'STANDARD';
}

/**
 * Calidad con histéresis. Sin `previous` equivale a `qualityFromScratch`. Con él: el ahorro de datos y la pérdida de
 * contexto bajan a LITE al instante; empeorar baja al instante (HIGH puede saltar a LITE); mejorar solo sube UN nivel y
 * solo tras `minHoldMs` en el nivel actual y cruzando el umbral de SALIDA, que es más exigente que el de entrada.
 */
export function resolveQuality(d: DeviceObservations, previous?: PreviousQuality): Quality {
  if (d.saveData || d.glContextLosses > 0) return 'LITE';
  if (!previous) return qualityFromScratch(d);
  const mustLite =
    atOrAbove(d.frameTimeP75Ms, T.liteEnterFrameMs) ||
    atOrAbove(d.tileErrorRate, T.liteEnterErrorRate);
  const held = previous.heldMs >= T.minHoldMs;
  switch (previous.quality) {
    case 'LITE': {
      const recovered =
        atOrBelow(d.frameTimeP75Ms, T.liteExitFrameMs) &&
        (d.tileErrorRate === null || d.tileErrorRate <= T.liteExitErrorRate);
      return recovered && held ? 'STANDARD' : 'LITE';
    }
    case 'STANDARD': {
      if (mustLite) return 'LITE';
      const canHigh =
        atOrBelow(d.frameTimeP75Ms, T.highEnterFrameMs) &&
        (d.tileErrorRate === null || d.tileErrorRate <= T.highEnterErrorRate);
      return canHigh && held ? 'HIGH' : 'STANDARD';
    }
    case 'HIGH': {
      if (mustLite) return 'LITE';
      const leaveHigh =
        atOrAbove(d.frameTimeP75Ms, T.highExitFrameMs) ||
        atOrAbove(d.tileErrorRate, T.highExitErrorRate);
      return leaveHigh ? 'STANDARD' : 'HIGH';
    }
  }
}
