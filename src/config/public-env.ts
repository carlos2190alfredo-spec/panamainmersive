/**
 * Único módulo de configuración que puede importar código de CLIENTE.
 * Solo contiene valores seguros de exponer al navegador. Las referencias a `process.env.NEXT_PUBLIC_*`
 * son estáticas: el build las sustituye. NUNCA importar aquí `./env` (arrastraría al bundle los
 * nombres de las variables secretas); lo comprueba tests/bundle/secrets.test.ts sobre el build.
 */
export const publicEnv = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000',
  tilesBaseUrl: process.env.NEXT_PUBLIC_TILES_BASE_URL ?? '/data',
} as const;
