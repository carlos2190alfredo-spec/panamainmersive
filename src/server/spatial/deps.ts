import { getEnv } from '@/config/env';
import { RIGHTS_POLICIES } from '@/lib/rights-policies';
import { createRunAnon } from './db';
import type { SpatialDeps } from './handlers';

/** Dependencias reales: entorno validado, políticas de derechos del producto y la BD de `DATABASE_URL`. */
export function defaultSpatialDeps(): SpatialDeps {
  const env = getEnv();
  return {
    siteEnv: env.SITE_ENV,
    policies: RIGHTS_POLICIES,
    runAnon: createRunAnon(env.DATABASE_URL),
  };
}
