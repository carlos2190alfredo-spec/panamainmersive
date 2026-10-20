/** Día calendario de hoy en Panamá (AAAA-MM-DD). La caducidad de la evidencia se evalúa por día. */
export function getTodayIsoDate(now: Date = new Date()): string {
  // `en-CA` formatea como AAAA-MM-DD; la zona es la de Panamá, no la del servidor.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Panama',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}
