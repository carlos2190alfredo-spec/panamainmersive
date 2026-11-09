import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TERRAIN_ORIGIN, buildCsp, securityHeaders } from '@/config/security-headers';

const prod = { production: true, development: false, connectOrigins: [TERRAIN_ORIGIN] } as const;
const dev = { production: false, development: true, connectOrigins: [TERRAIN_ORIGIN] } as const;

const directive = (csp: string, name: string) =>
  csp
    .split('; ')
    .find((d) => d.startsWith(`${name} `))
    ?.slice(name.length + 1);

describe('CSP (ADR-0010)', () => {
  it("producción: script-src es exactamente 'self' 'unsafe-inline', sin eval", () => {
    const csp = buildCsp(prod);
    expect(directive(csp, 'script-src')).toBe("'self' 'unsafe-inline'");
    expect(csp).not.toContain('unsafe-eval');
  });

  it('desarrollo permite eval solo para HMR', () => {
    expect(directive(buildCsp(dev), 'script-src')).toContain("'unsafe-eval'");
  });

  it('las demás directivas son estrictas aunque script-src no lo sea', () => {
    const csp = buildCsp(prod);
    expect(directive(csp, 'default-src')).toBe("'self'");
    expect(directive(csp, 'object-src')).toBe("'none'");
    expect(directive(csp, 'base-uri')).toBe("'self'");
    expect(directive(csp, 'form-action')).toBe("'self'");
    expect(directive(csp, 'frame-ancestors')).toBe("'none'");
    expect(directive(csp, 'style-src')).toBe("'self'");
    expect(directive(csp, 'font-src')).toBe("'self'");
  });

  it('MapLibre puede crear su worker desde blob: y nada más amplía worker-src', () => {
    expect(directive(buildCsp(prod), 'worker-src')).toBe("'self' blob:");
  });

  it('solo se conecta a self y a los orígenes declarados explícitamente', () => {
    expect(directive(buildCsp(prod), 'connect-src')).toBe(`'self' ${TERRAIN_ORIGIN}`);
    expect(directive(buildCsp({ ...prod, connectOrigins: [] }), 'connect-src')).toBe("'self'");
  });

  it('imágenes: self, data: y blob: más los orígenes declarados', () => {
    expect(
      directive(buildCsp({ ...prod, imgOrigins: ['https://img.example.org'] }), 'img-src'),
    ).toBe("'self' data: blob: https://img.example.org");
  });

  it('upgrade-insecure-requests solo en producción', () => {
    expect(buildCsp(prod)).toContain('upgrade-insecure-requests');
    expect(buildCsp(dev)).not.toContain('upgrade-insecure-requests');
  });

  it('ningún comodín ni esquema abierto en connect/img/worker', () => {
    const csp = buildCsp(prod);
    for (const name of ['connect-src', 'img-src', 'worker-src', 'script-src', 'default-src']) {
      const value = directive(csp, name) ?? '';
      expect(value, name).not.toMatch(/(^| )\*( |$)/);
      expect(value, name).not.toMatch(/(^| )https?:( |$)/);
    }
  });
});

describe('cabeceras de seguridad', () => {
  const get = (opts: typeof prod | typeof dev, key: string) =>
    securityHeaders(opts).find((h) => h.key === key)?.value;

  it('incluyen las de endurecimiento esperadas', () => {
    expect(get(prod, 'X-Content-Type-Options')).toBe('nosniff');
    expect(get(prod, 'X-Frame-Options')).toBe('DENY');
    expect(get(prod, 'Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(get(prod, 'Cross-Origin-Opener-Policy')).toBe('same-origin');
  });

  it('ninguna capacidad sensible se permite, tampoco la geolocalización (el producto ya no la usa; r3:N-03)', () => {
    const pp = get(prod, 'Permissions-Policy') ?? '';
    for (const f of ['geolocation', 'camera', 'microphone', 'payment', 'usb'])
      expect(pp, f).toContain(`${f}=()`);
    // Ni «self» ni «*» para ninguna: una capacidad abierta sin función que la use es superficie de ataque gratuita
    expect(pp).not.toMatch(/=\((self|\*)/);
    expect(get(dev, 'Permissions-Policy')).toBe(pp);
  });

  it('el producto no pide la ubicación: ningún código del cliente llama a la API de geolocalización', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        return statSync(path).isDirectory() ? walk(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
      });
    const offenders = walk('src').filter((file) =>
      /\bgeolocation\b/.test(readFileSync(file, 'utf8').replace(/\/\/.*$|\/\*[\s\S]*?\*\//gm, '')),
    );
    // Solo la propia política de cabeceras nombra la capacidad (para cerrarla)
    expect(offenders).toEqual(['src/config/security-headers.ts']);
  });

  it('HSTS solo en producción', () => {
    expect(get(prod, 'Strict-Transport-Security')).toMatch(/max-age=\d+/);
    expect(get(dev, 'Strict-Transport-Security')).toBeUndefined();
  });
});
