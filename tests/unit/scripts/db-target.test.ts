import { describe, expect, it } from 'vitest';
import { checkDatabaseTarget, refusalMessage } from '../../../scripts/db/target';

/**
 * La guardia de «base remota» (migrate, import-areas y content:export) debe decidir sobre el host al que `pg` SE
 * CONECTARÁ, no sobre el que cree ver otro analizador de URL: `?host=` lo sustituye, el socket Unix y el loopback
 * IPv6 tienen formas que `new URL()` interpreta distinto. Una URL malformada no puede volcar la contraseña.
 */
describe('guardia de la base de datos de destino', () => {
  it('?host= sustituye al host de la URL: se evalúa el real, no «localhost»', () => {
    expect(
      checkDatabaseTarget(
        'postgresql://postgres@localhost/db?host=zz-remote-host.invalid',
        undefined,
      ),
    ).toEqual({ ok: false, reason: 'remote_unconfirmed', host: 'zz-remote-host.invalid' });
  });

  it('socket Unix (con ?host= y con host codificado) y loopback IPv6 son locales', () => {
    for (const url of [
      'postgresql://u@/db?host=/tmp/sock',
      'postgresql://%2Ftmp%2Fsock/db',
      'postgresql://u@[::1]:5432/db',
      'postgresql://u@127.0.0.1:5432/db',
      'postgresql://u@LOCALHOST/db',
    ]) {
      const t = checkDatabaseTarget(url, undefined);
      expect(t.ok, url).toBe(true);
    }
  });

  it('una base remota se acepta solo confirmando exactamente ese host', () => {
    const url = 'postgresql://u:p@db.example.org:5432/app';
    expect(checkDatabaseTarget(url, undefined)).toEqual({
      ok: false,
      reason: 'remote_unconfirmed',
      host: 'db.example.org',
    });
    expect(checkDatabaseTarget(url, 'otro.example.org')).toMatchObject({ ok: false });
    expect(checkDatabaseTarget(url, 'db.example.org')).toEqual({
      ok: true,
      host: 'db.example.org',
    });
  });

  it('el host remoto sale con ?host= también cuando se confirma otro (el de la URL)', () => {
    const url = 'postgresql://u@localhost/db?host=prod.example.org';
    expect(checkDatabaseTarget(url, 'localhost')).toMatchObject({ ok: false });
    expect(checkDatabaseTarget(url, 'prod.example.org')).toEqual({
      ok: true,
      host: 'prod.example.org',
    });
  });

  it('una URL malformada se rechaza y NINGÚN mensaje contiene la contraseña', () => {
    const url = 'postgresql://panama:Sup3r/Secret@db.example.com:5x/db';
    const target = checkDatabaseTarget(url, undefined);
    expect(target).toEqual({ ok: false, reason: 'invalid_url' });
    if (target.ok) throw new Error('debía rechazarse');
    const message = refusalMessage(target, 'CONTENT_CONFIRM_REMOTE');
    for (const secret of ['Sup3r', 'Secret', 'panama:', url]) {
      expect(message).not.toContain(secret);
    }
  });

  it('el mensaje de rechazo remoto nombra el host y la variable de confirmación', () => {
    const message = refusalMessage(
      { ok: false, reason: 'remote_unconfirmed', host: 'db.example.org' },
      'CONTENT_CONFIRM_REMOTE',
    );
    expect(message).toContain('db.example.org');
    expect(message).toContain('CONTENT_CONFIRM_REMOTE=db.example.org');
  });
});
