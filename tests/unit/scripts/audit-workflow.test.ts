import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guardas TEXTUALES de `.github/workflows/audit.yml` (T-20). No lo ejecutan (ESTADO: IMPLEMENTED, no VERIFIED: no hay
 * remoto). La auditoría de avisos va APARTE de `ci.yml` a propósito: la base de avisos cambia aunque el código no
 * cambie, y un aviso nuevo sobre algo no relacionado no debe bloquear un cambio (PROMPT-MAESTRO §18). Por eso se
 * programa, y por eso no debe engancharse nunca a `push` ni a `pull_request`. El mismo calendario vigila que la
 * evidencia de cobertura no esté a punto de caducar (T-19): también cambia con la FECHA, no con el código.
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

/** Cuerpos de los jobs (`  nombre:` a dos espacios bajo `jobs:`). */
function jobBlocks(source: string): Record<string, string> {
  const start = source.indexOf('\njobs:\n');
  expect(start, 'el flujo tiene `jobs:`').toBeGreaterThan(-1);
  const blocks: Record<string, string[]> = {};
  let current: string | null = null;
  for (const line of source
    .slice(start + 1)
    .split('\n')
    .slice(1)) {
    const header = /^ {2}([a-z0-9-]+):\s*$/.exec(line);
    if (header?.[1] !== undefined) {
      current = header[1];
      blocks[current] = [];
    } else if (current !== null) {
      blocks[current]?.push(line);
    }
  }
  return Object.fromEntries(Object.entries(blocks).map(([id, body]) => [id, body.join('\n')]));
}

const jobs = jobBlocks(workflow);

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

  it('declara exactamente estos jobs: la auditoría y la vigencia de la cobertura', () => {
    expect(Object.keys(jobs).sort()).toEqual(['audit', 'coverage']);
  });

  it.each(['audit', 'coverage'])('%s: tiene `timeout-minutes` razonable (1–60)', (id) => {
    const minutes = Number(/^ {4}timeout-minutes:\s*(\d+)\s*$/m.exec(jobs[id] ?? '')?.[1]);
    expect(minutes).toBeGreaterThanOrEqual(1);
    expect(minutes).toBeLessThanOrEqual(60);
  });

  it.each([
    ['audit', 'pnpm check:audit'],
    ['coverage', 'pnpm check:coverage'],
  ])('%s: instala con el lockfile congelado y ejecuta `%s`', (id, command) => {
    const block = jobs[id] ?? '';
    expect(block).toMatch(/run:\s*pnpm install --frozen-lockfile/);
    expect(block).toMatch(new RegExp(`^ {6}- run: ${command}\\s*$`, 'm'));
  });

  it('cada job ejecuta SOLO lo suyo (la auditoría no mira la cobertura ni al revés)', () => {
    expect(jobs.audit).not.toContain('check:coverage');
    expect(jobs.coverage).not.toContain('check:audit');
  });

  it('ningún job ni paso lleva `if:` (un job que nunca se ejecuta sería un verde que no mide nada)', () => {
    expect(workflow).not.toMatch(/^\s*(-\s+)?if:/m);
  });

  it('ningún job cambia los permisos: solo vale el `contents: read` de arriba', () => {
    for (const [id, body] of Object.entries(jobs)) {
      expect(body, `job ${id}`).not.toMatch(/^\s+permissions:/m);
    }
  });

  it('no usa `continue-on-error` (un fallo de la auditoría tiene que verse en rojo)', () => {
    expect(workflow).not.toMatch(/continue-on-error/);
  });
});
