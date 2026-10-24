import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guardas TEXTUALES de `.github/workflows/audit.yml` (T-20). No lo ejecutan (ESTADO: IMPLEMENTED, no VERIFIED: no hay
 * remoto). La auditoría de avisos va APARTE de `ci.yml` a propósito: la base de avisos cambia aunque el código no
 * cambie, y un aviso nuevo sobre algo no relacionado no debe bloquear un cambio (PROMPT-MAESTRO §18). Por eso se
 * programa, y por eso no debe engancharse nunca a `push` ni a `pull_request`.
 */
const workflow = readFileSync(join(process.cwd(), '.github/workflows/audit.yml'), 'utf8');

/** Las líneas del bloque `on:` (hasta la siguiente clave de primer nivel). */
function triggers(source: string): string {
  const lines = source.split('\n');
  const start = lines.findIndex((l) => /^on:\s*$/.test(l));
  expect(start, 'el flujo tiene `on:`').toBeGreaterThan(-1);
  const body: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    body.push(line);
  }
  return body.join('\n');
}

describe('audit.yml', () => {
  it('se ejecuta por calendario y a mano', () => {
    const on = triggers(workflow);
    expect(on).toMatch(/^ {2}schedule:\s*$/m);
    expect(on).toMatch(/- cron:\s*'[^']+'/);
    expect(on).toMatch(/^ {2}workflow_dispatch:/m);
  });

  it('NO se engancha a push ni a pull_request (un aviso nuevo no debe bloquear un cambio sin relación)', () => {
    const on = triggers(workflow);
    expect(on).not.toMatch(/^ {2}push:/m);
    expect(on).not.toMatch(/^ {2}pull_request/m);
  });

  it('solo lee el repositorio', () => {
    expect(workflow).toMatch(/^permissions:\n {2}contents: read\s*$/m);
  });

  it('tiene `timeout-minutes` razonable (1–60)', () => {
    const minutes = Number(/^ {4}timeout-minutes:\s*(\d+)\s*$/m.exec(workflow)?.[1]);
    expect(minutes).toBeGreaterThanOrEqual(1);
    expect(minutes).toBeLessThanOrEqual(60);
  });

  it('instala con el lockfile congelado y ejecuta la auditoría', () => {
    expect(workflow).toMatch(/run:\s*pnpm install --frozen-lockfile/);
    expect(workflow).toMatch(/run:\s*pnpm check:audit\s*$/m);
  });

  it('no usa `continue-on-error` (un fallo de la auditoría tiene que verse en rojo)', () => {
    expect(workflow).not.toMatch(/continue-on-error/);
  });
});
