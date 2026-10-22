import { panamaDay } from '@/domains/content/dates';

/** Día calendario de hoy en Panamá (AAAA-MM-DD). La caducidad de la evidencia se evalúa por día. */
export const getTodayIsoDate = (now: Date = new Date()): string => panamaDay(now);
