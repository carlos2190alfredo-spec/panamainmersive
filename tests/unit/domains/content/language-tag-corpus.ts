/** Corpus de etiquetas de idioma compartido por la prueba unitaria y la de paridad con la BD (F4-15). */
export const VALID_TAGS = [
  'es',
  'en',
  'pt',
  'fr',
  'de',
  'fil',
  'haw',
  'pt-BR',
  'es-419',
  'zh-Hant',
  'zh-Hant-TW',
  'sr-Latn-RS',
] as const;

export const INVALID_TAGS = [
  '',
  ' ',
  'e',
  'E',
  'ES',
  'Es',
  'esp1',
  'en_US',
  'en-us',
  'en-US-',
  '-en',
  'en-',
  'english',
  'en-USA',
  'en-latn',
  'en-LATN',
  'en-Latn-us',
  'es-es',
  'es-41',
  'es-4190',
  ' es',
  'es ',
  'es\n',
  '\nes',
  'en\u0000',
  'eñ', // «eñ»
  'ｅｎ', // «ｅｎ» de ancho completo
  'en-ＵＳ', // «en-ＵＳ»
  'en-١٢٣', // dígitos arábigo-índicos
  '1234',
  'en-US-x-private',
] as const;
