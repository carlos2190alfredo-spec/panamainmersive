/**
 * Cabeceras de seguridad y CSP (ADR-0010, docs/security.md). Función pura: la usan
 * next.config.ts y las pruebas. Cada origen externo exige una entrada EXPLÍCITA aquí
 * y su derecho en docs/provider-rights.md.
 */
export interface SecurityHeadersOptions {
  readonly production: boolean;
  readonly development: boolean;
  /** Orígenes a los que el navegador puede conectarse además de `self` (teselas, terreno). */
  readonly connectOrigins: readonly string[];
  /** Orígenes de imágenes además de `self`, `data:` y `blob:`. */
  readonly imgOrigins?: readonly string[];
}

/** Terreno AWS Terrarium (CORS `*` verificado, evidence-log E-25). */
export const TERRAIN_ORIGIN = 'https://elevation-tiles-prod.s3.amazonaws.com';

export function buildCsp(opts: SecurityHeadersOptions): string {
  const connect = ["'self'", ...opts.connectOrigins].join(' ');
  const img = ["'self'", 'data:', 'blob:', ...(opts.imgOrigins ?? [])].join(' ');
  const directives: Record<string, string> = {
    'default-src': "'self'",
    // ADR-0010 (decisión basada en evidencia): Next emite 3 scripts EN LÍNEA (arranque de Turbopack,
    // `__next_f` y un payload RSC de 13–17 KB distinto en cada página) que `script-src 'self'` bloquea,
    // dejando la aplicación sin hidratar. Un CSP por hashes exigiría cientos de hashes por cabecera y el
    // nonce obliga a render dinámico (sin páginas estáticas). SRI experimental cubre solo 6 de 9 scripts.
    // Por eso `'unsafe-inline'` en script-src; se compensa con el resto de directivas estrictas y con
    // la prohibición (lint) de `dangerouslySetInnerHTML`. `'unsafe-eval'` solo en desarrollo (HMR).
    'script-src': opts.development
      ? "'self' 'unsafe-inline' 'unsafe-eval'"
      : "'self' 'unsafe-inline'",
    'style-src': opts.development ? "'self' 'unsafe-inline'" : "'self'",
    'img-src': img,
    'font-src': "'self'",
    'connect-src': connect,
    // MapLibre ejecuta su worker desde un blob:.
    'worker-src': "'self' blob:",
    'object-src': "'none'",
    'base-uri': "'self'",
    'form-action': "'self'",
    'frame-ancestors': "'none'",
    'manifest-src': "'self'",
  };
  const parts = Object.entries(directives).map(([k, v]) => `${k} ${v}`);
  if (opts.production) parts.push('upgrade-insecure-requests');
  return parts.join('; ');
}

export interface HeaderEntry {
  readonly key: string;
  readonly value: string;
}

export function securityHeaders(opts: SecurityHeadersOptions): HeaderEntry[] {
  const headers: HeaderEntry[] = [
    { key: 'Content-Security-Policy', value: buildCsp(opts) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    // La geolocalización solo se pide con consentimiento explícito y desde este origen.
    {
      key: 'Permissions-Policy',
      value: 'geolocation=(self), camera=(), microphone=(), payment=(), usb=(), interest-cohort=()',
    },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  ];
  if (opts.production) {
    headers.push({
      key: 'Strict-Transport-Security',
      value: 'max-age=31536000; includeSubDomains',
    });
  }
  return headers;
}
