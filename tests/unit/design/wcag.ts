/**
 * Cálculo de contraste WCAG 2.x (luminancia relativa) para las pruebas de diseño. No es `*.test.ts`: vitest no lo
 * recoge. Sus controles (21:1, 1:1, el rojo de marca 5,43:1, la mezcla con opacidad) están en contrast.test.ts.
 */

/** Luminancia relativa de un `#rrggbb`. */
export function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [
    number,
    number,
    number,
  ];
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Razón de contraste de dos `#rrggbb` (≥ 1). */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** Mezcla `fg` con opacidad `alpha` sobre `bg` (ambos `#rrggbb`), redondeando por canal como el navegador. */
export function blend(fg: string, bg: string, alpha: number): string {
  const channel = (i: number) =>
    Math.round(
      alpha * parseInt(fg.slice(i, i + 2), 16) + (1 - alpha) * parseInt(bg.slice(i, i + 2), 16),
    )
      .toString(16)
      .padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}
