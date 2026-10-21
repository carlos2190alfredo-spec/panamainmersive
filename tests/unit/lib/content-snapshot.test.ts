import { describe, expect, it } from 'vitest';
import { DESTINATION_KEYS } from '@/domains/tourism/destinations';
import { PUBLISHED_CONTENT, contentFor } from '@/lib/content-snapshot';

describe('contenido publicado (cargador)', () => {
  it('hoy no hay contenido verificado: la instantánea está vacía y nunca se ha exportado', () => {
    expect(PUBLISHED_CONTENT.assertions).toEqual([]);
    expect(PUBLISHED_CONTENT.notices).toEqual([]);
    expect(PUBLISHED_CONTENT.generatedAt).toBeNull();
  });

  it('cada destino devuelve listas vacías: no se inventa nada', () => {
    for (const key of DESTINATION_KEYS) {
      const c = contentFor(key);
      expect(c.assertions).toEqual([]);
      expect(c.notices).toEqual([]);
    }
  });
});
