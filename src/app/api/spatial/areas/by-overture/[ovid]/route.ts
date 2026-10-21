import { defaultSpatialDeps } from '@/server/spatial/deps';
import { handleAreaByOvertureId } from '@/server/spatial/handlers';

export const dynamic = 'force-dynamic';

/** Ficha de un área por su ID de Overture (el `ovid` de las teselas); nunca por nombre. */
export async function GET(
  request: Request,
  context: { params: Promise<{ ovid: string }> },
): Promise<Response> {
  const { ovid } = await context.params;
  return handleAreaByOvertureId(request, ovid, defaultSpatialDeps());
}
