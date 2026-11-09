import { describe, expect, it } from 'vitest';
import {
  chooseLabels,
  labelBox,
  type Box,
  type LabelCandidate,
  type LabelLayoutInput,
  type LabelObstacle,
} from '@/domains/geography/label-layout';

/**
 * Qué etiquetas de marcador se ven sin pasar el cursor (r1:V-15). Lógica pura: las cajas las mide quien llama.
 * Reglas: la etiqueta cuelga debajo de su marcador; solo se muestra si NO toca otro botón, NO toca otra etiqueta ya colocada
 * y cabe ENTERA en el hueco libre; el seleccionado siempre se ve y reserva su sitio primero.
 */
const TARGET = 44;
const OVERLAP = 5.6;
const GAP = 4;

const boxOf = (x: number, y: number): Box => ({
  left: x - TARGET / 2,
  top: y - TARGET / 2,
  right: x + TARGET / 2,
  bottom: y + TARGET / 2,
});

const point = (key: string, x: number, y: number, extra: Partial<LabelCandidate> = {}) => ({
  candidate: { key, x, y, width: 120, height: 28, ...extra } satisfies LabelCandidate,
  obstacle: { key, box: boxOf(x, y) } satisfies LabelObstacle,
});

function layout(
  points: readonly ReturnType<typeof point>[],
  extra: Partial<LabelLayoutInput> & { clusters?: readonly Box[] } = {},
): Set<string> {
  const { clusters = [], ...rest } = extra;
  return chooseLabels({
    candidates: points.map((p) => p.candidate),
    obstacles: [
      ...points.map((p) => p.obstacle),
      ...clusters.map((box, i) => ({ key: `cluster-${String(i)}`, box })),
    ],
    bounds: { left: 0, top: 0, right: 1000, bottom: 600 },
    target: TARGET,
    overlap: OVERLAP,
    gap: GAP,
    ...rest,
  });
}

describe('labelBox', () => {
  it('cuelga debajo de la caja del marcador, centrada, y sube `overlap` px sobre ella', () => {
    const box = labelBox({ x: 100, y: 200, width: 120, height: 28 }, TARGET, OVERLAP);
    expect(box.left).toBe(40);
    expect(box.right).toBe(160);
    expect(box.top).toBeCloseTo(200 + 22 - 5.6, 6);
    expect(box.bottom - box.top).toBe(28);
  });
});

describe('chooseLabels', () => {
  it('un marcador aislado muestra su etiqueta', () => {
    expect(layout([point('a', 300, 200)])).toEqual(new Set(['a']));
  });

  it('con la lista vacía no hay nada que mostrar', () => {
    expect(layout([])).toEqual(new Set());
  });

  it('su PROPIO botón no cuenta como obstáculo (la etiqueta cuelga de él y lo solapa 5,6 px a propósito)', () => {
    const own = point('a', 300, 200);
    expect(labelBox(own.candidate, TARGET, OVERLAP).top).toBeLessThan(own.obstacle.box.bottom);
    expect(layout([own]).has('a')).toBe(true);
  });

  it('NO se muestra si taparía a otro marcador (el de debajo)', () => {
    // «b» está justo bajo «a»: la etiqueta de «a» cae sobre su caja de 44 px
    expect(layout([point('a', 300, 200), point('b', 300, 250)])).toEqual(new Set(['b']));
  });

  it('NO se muestra si taparía un GRUPO de marcadores', () => {
    const cluster = boxOf(300, 255);
    expect(layout([point('a', 300, 200)], { clusters: [cluster] })).toEqual(new Set());
  });

  it('un obstáculo lejano no estorba, y uno al lado (misma altura) tampoco si deja la holgura', () => {
    expect(layout([point('a', 300, 200), point('b', 700, 200)])).toEqual(new Set(['a', 'b']));
    // «b» a la derecha, su caja empieza 8 px más allá del borde de la etiqueta de «a»: queda holgura (> 4 px)
    expect(layout([point('a', 300, 200), point('b', 300 + 60 + 8 + 22, 200 - 60)])).toEqual(
      new Set(['a', 'b']),
    );
  });

  it('la holgura cuenta: a 3 px de otro botón (< 4 px) NO se muestra; a 6 px sí', () => {
    // la etiqueta de «a» llega hasta x = 360 y baja de y = 216,4 a 244,4
    const near = (gapPx: number) => ({
      key: 'b',
      box: { left: 360 + gapPx, top: 216, right: 360 + gapPx + 44, bottom: 260 },
    });
    const run = (gapPx: number) =>
      chooseLabels({
        candidates: [point('a', 300, 200).candidate],
        obstacles: [point('a', 300, 200).obstacle, near(gapPx)],
        bounds: null,
        target: TARGET,
        overlap: OVERLAP,
        gap: GAP,
      });
    expect(run(3).has('a')).toBe(false);
    expect(run(6).has('a')).toBe(true);
  });

  it('dos etiquetas que se pisarían: gana la de MÁS prioridad (la primera de la lista) y la otra queda sin ver', () => {
    // dos marcadores a la misma altura, a 100 px: sus botones (44 px) no se tocan ni tocan la etiqueta del otro, pero sus
    // etiquetas de 120 px se pisarían
    const a = point('a', 300, 200);
    const b = point('b', 400, 200);
    expect(layout([a, b])).toEqual(new Set(['a']));
    expect(layout([b, a])).toEqual(new Set(['b']));
  });

  it('el SELECCIONADO se muestra siempre, reserva su sitio primero y los demás se apartan', () => {
    const a = point('a', 300, 200);
    const b = point('b', 400, 200, { pinned: true });
    // «a» va primero en la lista, pero «b» está fijado: sale «b» y «a» se aparta
    expect(layout([a, b])).toEqual(new Set(['b']));
    // aunque el fijado tocase otro botón, no se juzga: se muestra
    const covered = point('c', 600, 200, { pinned: true });
    expect(layout([covered], { clusters: [boxOf(600, 250)] })).toEqual(new Set(['c']));
  });

  it('una etiqueta que no cabe ENTERA en el hueco libre no se muestra (ni a medias bajo un panel)', () => {
    const bounds = { left: 100, top: 100, right: 500, bottom: 400 };
    expect(layout([point('a', 300, 200)], { bounds }).has('a')).toBe(true);
    expect(layout([point('a', 130, 200)], { bounds }).has('a')).toBe(false); // se sale por la izquierda (130 − 60 < 100)
    expect(layout([point('a', 470, 200)], { bounds }).has('a')).toBe(false); // por la derecha
    expect(layout([point('a', 300, 385)], { bounds }).has('a')).toBe(false); // por abajo
    // sin hueco conocido (`null`) vale cualquier sitio
    expect(layout([point('a', 5, 5)], { bounds: null }).has('a')).toBe(true);
  });

  it('una etiqueta sin medir (ancho o alto 0) no se juzga a ciegas: no se muestra', () => {
    expect(layout([point('a', 300, 200, { width: 0 })]).size).toBe(0);
    expect(layout([point('a', 300, 200, { height: 0 })]).size).toBe(0);
  });

  it('es determinista y no muta sus entradas', () => {
    const points = [point('a', 300, 200), point('b', 370, 200), point('c', 700, 300)];
    const before = JSON.stringify(points);
    const first = [...layout(points)];
    expect(JSON.stringify(points)).toBe(before);
    expect([...layout(points)]).toEqual(first);
  });

  it('PROPIEDAD: ninguna etiqueta mostrada (salvo la fijada) toca otro botón ni otra etiqueta mostrada, en 300 disposiciones al azar', () => {
    let seed = 1234567;
    const random = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const bounds = { left: 0, top: 0, right: 900, bottom: 500 };
    for (let run = 0; run < 300; run++) {
      const count = 2 + Math.floor(random() * 8);
      const points = Array.from({ length: count }, (_, i) =>
        point(`m${String(i)}`, 30 + random() * 840, 30 + random() * 440, {
          width: 60 + random() * 120,
          height: 24 + random() * 8,
        }),
      );
      const shown = layout(points, { bounds });
      const boxes = points
        .filter((p) => shown.has(p.candidate.key))
        .map((p) => ({ key: p.candidate.key, box: labelBox(p.candidate, TARGET, OVERLAP) }));
      for (const [i, a] of boxes.entries()) {
        // cabe entera
        expect(a.box.left).toBeGreaterThanOrEqual(bounds.left);
        expect(a.box.right).toBeLessThanOrEqual(bounds.right);
        expect(a.box.bottom).toBeLessThanOrEqual(bounds.bottom);
        // no toca ningún botón ajeno (con holgura)
        for (const p of points) {
          if (p.candidate.key === a.key) continue;
          const o = p.obstacle.box;
          const touches =
            a.box.left < o.right + GAP &&
            o.left < a.box.right + GAP &&
            a.box.top < o.bottom + GAP &&
            o.top < a.box.bottom + GAP;
          expect(touches, `ejecución ${String(run)}: ${a.key} sobre ${p.candidate.key}`).toBe(
            false,
          );
        }
        // no toca otra etiqueta mostrada
        for (const b of boxes.slice(i + 1)) {
          const touches =
            a.box.left < b.box.right + GAP &&
            b.box.left < a.box.right + GAP &&
            a.box.top < b.box.bottom + GAP &&
            b.box.top < a.box.bottom + GAP;
          expect(touches, `ejecución ${String(run)}: etiquetas ${a.key} y ${b.key}`).toBe(false);
        }
      }
    }
  });
});
