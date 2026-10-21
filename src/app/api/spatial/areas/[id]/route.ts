import { defaultSpatialDeps } from '@/server/spatial/deps';
import { handleAreaDetail } from '@/server/spatial/handlers';

export const dynamic = 'force-dynamic';

/** Ficha de un área por ID estable (nunca por nombre). */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  return handleAreaDetail(request, id, defaultSpatialDeps());
}
