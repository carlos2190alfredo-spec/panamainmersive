import { defaultSpatialDeps } from '@/server/spatial/deps';
import { handleAreas } from '@/server/spatial/handlers';

// Depende de la petición y de la BD: nunca se prerenderiza.
export const dynamic = 'force-dynamic';

/** Áreas visibles en una ventana (docs/gis.md §5, ADR-0016). */
export function GET(request: Request): Promise<Response> {
  return handleAreas(request, defaultSpatialDeps());
}
