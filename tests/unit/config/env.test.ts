import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, featureState, findPublicSecrets, parseEnv } from '@/config/env';

describe('configuración validada', () => {
  it('con un entorno vacío usa valores seguros por defecto (desarrollo, integraciones apagadas)', () => {
    const env = parseEnv({});
    expect(env.SITE_ENV).toBe('development');
    expect(env.NEXT_PUBLIC_SITE_URL).toBe('http://localhost:3000');
    expect(env.FEATURE_GOOGLE_3D).toBe(false);
    expect(env.FEATURE_CESIUM).toBe(false);
    expect(env.FEATURE_MAPILLARY).toBe(false);
  });

  it('un valor inválido detiene el arranque y lista TODOS los problemas', () => {
    try {
      parseEnv({ SITE_ENV: 'prod', NEXT_PUBLIC_SITE_URL: 'no-es-url', FEATURE_CESIUM: 'quizás' });
      expect.unreachable('debía lanzar');
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const msg = (e as ConfigError).issues.join('\n');
      expect(msg).toContain('SITE_ENV');
      expect(msg).toContain('NEXT_PUBLIC_SITE_URL');
      expect(msg).toContain('FEATURE_CESIUM');
    }
  });

  it('las cadenas vacías (VAR=) cuentan como ausentes', () => {
    expect(parseEnv({ GOOGLE_MAPS_API_KEY: '', SITE_ENV: '' }).GOOGLE_MAPS_API_KEY).toBeUndefined();
  });

  it('producción exige https y rechaza localhost', () => {
    expect(() => parseEnv({ SITE_ENV: 'production' })).toThrow(/https|localhost/);
    expect(() => parseEnv({ SITE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'http://example.org' })).toThrow(/https/);
    expect(parseEnv({ SITE_ENV: 'production', NEXT_PUBLIC_SITE_URL: 'https://example.org' }).SITE_ENV).toBe(
      'production',
    );
  });

  it('un secreto con prefijo NEXT_PUBLIC_ se rechaza (se expondría al navegador)', () => {
    for (const name of [
      'NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY',
      'NEXT_PUBLIC_AI_API_KEY',
      'NEXT_PUBLIC_CESIUM_ION_TOKEN',
      'NEXT_PUBLIC_DB_PASSWORD',
    ]) {
      expect(findPublicSecrets({ [name]: 'x' }), name).toEqual([name]);
      expect(() => parseEnv({ [name]: 'x' }), name).toThrow(/NEXT_PUBLIC_/);
    }
  });

  it('las claves públicas de mapas en la lista blanca sí se permiten con prefijo', () => {
    expect(findPublicSecrets({ NEXT_PUBLIC_GOOGLE_MAPS_KEY: 'k' })).toEqual([]);
    expect(findPublicSecrets({ NEXT_PUBLIC_SITE_URL: 'https://x', NEXT_PUBLIC_TILES_BASE_URL: '/data' })).toEqual([]);
  });

  it('.env.example no contiene secretos con prefijo público ni valores reales', () => {
    const text = readFileSync(join(process.cwd(), '.env.example'), 'utf8');
    const names = [...text.matchAll(/^#?\s*([A-Z][A-Z0-9_]+)=/gm)].map((m) => m[1] ?? '');
    expect(findPublicSecrets(Object.fromEntries(names.map((n) => [n, 'x'])))).toEqual([]);
    // Toda credencial está comentada y vacía en la plantilla.
    for (const line of text.split('\n')) {
      if (/^(GOOGLE_MAPS_API_KEY|CESIUM_ION_TOKEN|MAPILLARY_ACCESS_TOKEN|DATABASE_URL)/.test(line)) {
        throw new Error(`Credencial sin comentar en .env.example: ${line}`);
      }
    }
  });
});

describe('integraciones: flag + credencial, con motivo observable', () => {
  it('flag apagado → deshabilitada por flag', () => {
    const env = parseEnv({ GOOGLE_MAPS_API_KEY: 'k' });
    expect(featureState('google3d', env)).toEqual({ enabled: false, reason: 'flag_off' });
  });

  it('flag encendido sin credencial → deshabilitada por falta de credencial (no se simula)', () => {
    const env = parseEnv({ FEATURE_GOOGLE_3D: 'true' });
    expect(featureState('google3d', env)).toEqual({ enabled: false, reason: 'missing_credential' });
  });

  it('flag + credencial → activa', () => {
    const env = parseEnv({ FEATURE_MAPILLARY: 'true', MAPILLARY_ACCESS_TOKEN: 't' });
    expect(featureState('mapillary', env)).toEqual({ enabled: true, reason: 'enabled' });
  });

  it('cada integración depende de SU credencial, no de la de otra', () => {
    const env = parseEnv({ FEATURE_CESIUM: 'true', GOOGLE_MAPS_API_KEY: 'k' });
    expect(featureState('cesium', env).reason).toBe('missing_credential');
  });
});
