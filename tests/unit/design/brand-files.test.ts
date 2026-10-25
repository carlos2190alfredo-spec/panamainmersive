import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Procedencia y forma de los archivos de marca (public/brand, src/app/icon.png, src/app/apple-icon.png).
 * `public/brand/SOURCE.json` registra de dónde sale cada archivo, su sha256 y sus dimensiones, y avisa de que la
 * titularidad y la licencia de las ilustraciones NO están verificadas. Esta prueba lo mantiene honesto: un archivo
 * cambiado sin actualizar su registro (o un archivo sin registrar) rompe. La imagen social y el icono de 512 px los
 * genera `pipelines/brand/make_og.py`; aquí se comprueba su FORMA (JPEG progresivo, ≤ 300 KB, 1200×630, RGBA 512×512).
 */
const ROOT = process.cwd();
const BRAND = join(ROOT, 'public', 'brand');
const read = (path: string): Buffer => readFileSync(join(ROOT, path));
const sha256 = (data: Buffer): string => createHash('sha256').update(data).digest('hex');

interface Entry {
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  origin: string;
}
const source = JSON.parse(read('public/brand/SOURCE.json').toString('utf8')) as {
  origin: { kind: string; originalFile: string; nature: string };
  operations: Record<string, string>;
  rights: { ownerOfRecord: string; status: string; unverified: string };
  files: Record<string, Entry>;
  appIcons: Record<string, Entry>;
};

/** Ancho y alto de un WebP (VP8X/VP8L/VP8), un PNG (IHDR) o un JPEG (primer marcador SOF). Lanza si no es ninguno. */
function imageSize(data: Buffer): {
  width: number;
  height: number;
  progressive?: boolean;
  alpha?: boolean;
} {
  if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') {
    const kind = data.toString('ascii', 12, 16);
    if (kind === 'VP8X') {
      return {
        width: 1 + data.readUIntLE(24, 3),
        height: 1 + data.readUIntLE(27, 3),
        alpha: (data[20]! & 0x10) !== 0,
      };
    }
    if (kind === 'VP8L') {
      const bits = data.readUInt32LE(21);
      return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >> 14) & 0x3fff), alpha: true };
    }
    if (kind === 'VP8 ')
      return { width: data.readUInt16LE(26) & 0x3fff, height: data.readUInt16LE(28) & 0x3fff };
  }
  if (data.toString('latin1', 1, 4) === 'PNG') {
    // Tipo de color de IHDR: 4 y 6 llevan canal alfa.
    return {
      width: data.readUInt32BE(16),
      height: data.readUInt32BE(20),
      alpha: data[25] === 4 || data[25] === 6,
    };
  }
  if (data[0] === 0xff && data[1] === 0xd8) {
    let i = 2;
    while (i + 9 < data.length) {
      if (data[i] !== 0xff) throw new Error('JPEG mal formado');
      const marker = data[i + 1]!;
      const length = data.readUInt16BE(i + 2);
      // SOF0..SOF15 salvo DHT (C4), JPG (C8) y DAC (CC).
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return {
          width: data.readUInt16BE(i + 7),
          height: data.readUInt16BE(i + 5),
          progressive: marker === 0xc2,
        };
      }
      i += 2 + length;
    }
  }
  throw new Error('no es un WebP, PNG ni JPEG reconocible');
}

describe('SOURCE.json frente a los archivos reales', () => {
  const listed = Object.keys(source.files).sort();

  it('registra TODOS los archivos de public/brand (y solo esos): ninguno sin procedencia', () => {
    const present = readdirSync(BRAND)
      .filter((f) => f !== 'SOURCE.json')
      .sort();
    expect(listed).toEqual(present);
  });

  it.each(Object.entries({ ...source.files }))(
    '%s: sha256, tamaño y dimensiones coinciden',
    (name, entry) => {
      const data = read(`public/brand/${name}`);
      expect(sha256(data), `${name}: sha256 (¿se regeneró sin actualizar SOURCE.json?)`).toBe(
        entry.sha256,
      );
      expect(data.length).toBe(entry.bytes);
      const { width, height } = imageSize(data);
      expect([width, height]).toEqual([entry.width, entry.height]);
    },
  );

  it.each(Object.entries(source.appIcons))(
    '%s: sha256, tamaño y dimensiones coinciden',
    (path, entry) => {
      const data = read(path);
      expect(sha256(data), path).toBe(entry.sha256);
      expect(data.length).toBe(entry.bytes);
      const { width, height } = imageSize(data);
      expect([width, height]).toEqual([entry.width, entry.height]);
    },
  );

  it('las marcas tienen canal alfa (se extrajeron con transparencia)', () => {
    for (const name of listed.filter((n) => n.startsWith('mark-'))) {
      expect(imageSize(read(`public/brand/${name}`)).alpha, name).toBe(true);
    }
  });

  it('dice la verdad sobre el origen y los derechos: ilustraciones de aspecto generado, titularidad sin verificar', () => {
    expect(source.origin.kind).toMatch(/persona propietaria/i);
    expect(source.origin.nature).toMatch(/aspecto generado/i);
    expect(source.origin.originalFile).toMatch(/NO está en el repositorio/);
    expect(source.rights.status).toBe('pendiente');
    expect(source.rights.unverified).toMatch(/NO se ha verificado/);
    expect(Object.keys(source.operations).join(' ')).toMatch(/og-1200x630\.jpg/);
    expect(Object.keys(source.operations).join(' ')).toMatch(/icon-512\.png/);
  });

  it('control: un archivo alterado cambia su sha256 (la comparación no es vacía)', () => {
    const data = read('public/brand/og-1200x630.jpg');
    const tampered = Buffer.concat([data, Buffer.from([0])]);
    expect(sha256(tampered)).not.toBe(source.files['og-1200x630.jpg']?.sha256);
  });
});

describe('imagen social (Open Graph / Twitter)', () => {
  const data = read('public/brand/og-1200x630.jpg');

  it('JPEG progresivo de 1200×630, ≤ 300 KB', () => {
    const size = imageSize(data);
    expect([size.width, size.height]).toEqual([1200, 630]);
    expect(size.progressive).toBe(true);
    expect(data.length).toBeLessThanOrEqual(300 * 1024);
  });

  it('sin metadatos (EXIF/XMP/ICC) ni comentarios: solo la imagen', () => {
    // Marcadores APPn (E1…EF) y COM (FE) hasta el comienzo del escaneo (FFDA). APP0/JFIF (E0) es la cabecera normal.
    const found: string[] = [];
    let i = 2;
    while (i + 3 < data.length && data[i + 1] !== 0xda) {
      const marker = data[i + 1]!;
      if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) found.push(marker.toString(16));
      i += 2 + data.readUInt16BE(i + 2);
    }
    expect(found).toEqual([]);
  });

  it('control: el lector distingue un JPEG base de uno progresivo y rechaza lo que no es imagen', () => {
    // SOF0 (C0) = base; SOF2 (C2) = progresivo. Cabecera mínima construida a mano.
    const sof = (marker: number) =>
      Buffer.from([
        0xff,
        0xd8,
        0xff,
        marker,
        0x00,
        0x11,
        0x08,
        0x02,
        0x76,
        0x04,
        0xb0,
        0x03,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
      ]);
    expect(imageSize(sof(0xc0)).progressive).toBe(false);
    expect(imageSize(sof(0xc2)).progressive).toBe(true);
    expect(() => imageSize(Buffer.from('texto'))).toThrow();
  });
});

describe('icono de 512 px', () => {
  it('PNG RGBA de 512×512 (el del manifiesto)', () => {
    const size = imageSize(read('public/brand/icon-512.png'));
    expect([size.width, size.height]).toEqual([512, 512]);
    expect(size.alpha).toBe(true);
  });

  it('src/app/icon.png (192 px) y apple-icon.png (180 px) existen donde Next los busca', () => {
    expect(imageSize(read('src/app/icon.png'))).toMatchObject({ width: 192, height: 192 });
    expect(imageSize(read('src/app/apple-icon.png'))).toMatchObject({ width: 180, height: 180 });
    expect(existsSync(join(ROOT, 'src', 'app', 'icon.svg'))).toBe(false); // el icono provisional se retiró
  });
});

describe('pipelines/brand/make_og.py', () => {
  const script = read('pipelines/brand/make_og.py').toString('utf8');

  it('no hornea texto (sin fuentes ni llamadas a text()) ni declara colores: los lee de tokens.css', () => {
    expect(script).not.toMatch(/ImageFont|ImageText|\.text\(|\.textbbox\(/);
    expect(script).toMatch(/src["']?\s*\/\s*["']styles["']\s*\/\s*["']tokens\.css|tokens\.css/);
    // Ningún `#rrggbb` literal (el patrón que busca los tokens va dentro de una expresión regular, sin la almohadilla suelta).
    expect(script.replace(/r"[^"]*"/g, '')).not.toMatch(/#[0-9a-fA-F]{6}\b/);
  });

  it('escribe las dos salidas y respeta el tope de 300 KB', () => {
    expect(script).toContain('og-1200x630.jpg');
    expect(script).toContain('icon-512.png');
    expect(script).toMatch(/OG_MAX_BYTES = 300 \* 1024/);
    expect(script).toMatch(/progressive=True/);
  });
});
