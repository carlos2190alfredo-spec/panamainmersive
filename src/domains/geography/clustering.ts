/**
 * Agrupamiento de marcadores por distancia EN PANTALLA. Dos botones de menos de ~44 px que se solapan no se
 * pueden pulsar con fiabilidad (WCAG 2.5.8) y uno oculta al otro; por eso, mientras estén demasiado cerca, se
 * presentan como UN solo botón de grupo que acerca el mapa. Función pura: la posición en pantalla la calcula
 * quien llama (`map.project`).
 *
 * Garantía (probada): tras agrupar, los centros de dos grupos cualesquiera distan al menos `radiusPx`.
 */
export interface ClusterPoint {
  readonly key: string;
  readonly x: number;
  readonly y: number;
  readonly lon: number;
  readonly lat: number;
}

export interface Cluster {
  /** Claves de los miembros unidas con `+`: estable mientras la composición no cambie. */
  readonly id: string;
  readonly keys: readonly string[];
  readonly lon: number;
  readonly lat: number;
}

interface Group {
  members: ClusterPoint[];
}

function center(group: Group): { x: number; y: number } {
  const n = group.members.length;
  return {
    x: group.members.reduce((sum, m) => sum + m.x, 0) / n,
    y: group.members.reduce((sum, m) => sum + m.y, 0) / n,
  };
}

export function clusterByScreenDistance(
  points: readonly ClusterPoint[],
  radiusPx: number,
): Cluster[] {
  // Fase 1: cada punto se une al primer grupo cuya SEMILLA está a menos de `radiusPx`.
  const groups: Group[] = [];
  for (const point of points) {
    const home = groups.find((g) => {
      const seed = g.members[0];
      return seed !== undefined && Math.hypot(seed.x - point.x, seed.y - point.y) < radiusPx;
    });
    if (home) home.members.push(point);
    else groups.push({ members: [point] });
  }

  // Fase 2: el centro de un grupo disperso puede quedar cerca de otro grupo; se fusionan hasta que no ocurra.
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const a = groups[i];
        const b = groups[j];
        if (!a || !b) continue;
        const ca = center(a);
        const cb = center(b);
        if (Math.hypot(ca.x - cb.x, ca.y - cb.y) < radiusPx) {
          a.members.push(...b.members);
          groups.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }

  return groups.map((g) => {
    const members = [...g.members].sort(
      (p, q) => points.findIndex((x) => x.key === p.key) - points.findIndex((x) => x.key === q.key),
    );
    const n = members.length;
    return {
      id: members.map((m) => m.key).join('+'),
      keys: members.map((m) => m.key),
      lon: members.reduce((sum, m) => sum + m.lon, 0) / n,
      lat: members.reduce((sum, m) => sum + m.lat, 0) / n,
    };
  });
}
