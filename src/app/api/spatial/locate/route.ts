import { defaultSpatialDeps } from '@/server/spatial/deps';
import { handleLocate } from '@/server/spatial/handlers';

export const dynamic = 'force-dynamic';

/** Áreas que cubren un punto (`ST_Covers`: el borde cuenta como dentro). */
export function GET(request: Request): Promise<Response> {
  return handleLocate(request, defaultSpatialDeps());
}
