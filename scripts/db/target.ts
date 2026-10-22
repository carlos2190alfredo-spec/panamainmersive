import { Client } from 'pg';
import { isLocalHost } from './lib';

/**
 * Guardia de «base remota» compartida por `db:migrate`, `db:import-areas` y `content:export`.
 *
 * Decide sobre el host al que `pg` SE CONECTARÁ, no sobre el que devolvería otro analizador de URL: en `pg`, un
 * `?host=` sustituye al de la URL, el socket Unix se escribe de varias formas y el loopback IPv6 lleva corchetes en
 * `new URL()` (que además lanza con `postgresql://u@/db?host=/tmp/sock`, forma válida para `pg`). Una URL que no se
 * puede interpretar se rechaza SIN mostrarla: suele llevar la contraseña (con `/`, `@` o `#` sin codificar).
 *
 * Límite que no se puede cerrar desde aquí: la guardia es POR NOMBRE. Un túnel o proxy a producción que escuche en
 * `localhost` (`ssh -L`, Cloud SQL Proxy) se ve como local. Quien abre un túnel asume esa responsabilidad.
 */
export type TargetCheck =
  | { readonly ok: true; readonly host: string }
  | { readonly ok: false; readonly reason: 'invalid_url' }
  | { readonly ok: false; readonly reason: 'remote_unconfirmed'; readonly host: string };

export function checkDatabaseTarget(url: string, confirmedHost: string | undefined): TargetCheck {
  let host: string;
  try {
    // El constructor solo analiza la URL; no abre ninguna conexión.
    host = new Client({ connectionString: url }).host;
  } catch {
    return { ok: false, reason: 'invalid_url' };
  }
  const local = isLocalHost(host.toLowerCase());
  const confirmed =
    confirmedHost !== undefined && confirmedHost.toLowerCase() === host.toLowerCase();
  return local || confirmed
    ? { ok: true, host }
    : { ok: false, reason: 'remote_unconfirmed', host };
}

/** Mensaje para quien ejecuta el CLI. Nunca incluye la URL ni parte de ella. */
export function refusalMessage(
  target: Exclude<TargetCheck, { ok: true }>,
  confirmVariable: string,
): string {
  if (target.reason === 'invalid_url') {
    return (
      'DATABASE_URL no se puede interpretar: revisa el formato (postgresql://usuario:clave@host:puerto/base) y ' +
      'codifica en la contraseña los caracteres / @ # ? con %XX. No se muestra el valor para no filtrar credenciales.'
    );
  }
  return (
    `Rechazado: «${target.host}» no es una base local. Si es intencionado y está autorizado, ` +
    `repite con ${confirmVariable}=${target.host}.`
  );
}
