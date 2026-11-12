/**
 * Marca, nombre y dominio centralizados (documento rector §2): cambiar el nombre provisional
 * se hace aquí, no en los mensajes (que usan el marcador `{siteName}`).
 */
export const SITE = {
  /** Nombre provisional del producto. */
  name: 'Panamá Immersive',
  /**
   * Rótulo de la marca en dos líneas (cabecera, portada). Es el nombre propio, no una traducción, y es TEXTO VIVO:
   * nunca una imagen de texto (WCAG 1.4.5). Se compone en mayúsculas por CSS; la unión de las dos partes es `name`.
   */
  wordmark: { primary: 'Panamá', secondary: 'Immersive' },
  /** País del contenido. */
  countryCode: 'PA',
  /** Identificador estable para almacenamiento local y claves (no mostrar). */
  slug: 'panama-immersive',
} as const;
