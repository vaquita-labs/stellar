import jsQR from 'jsqr';
import { describe, expect, it } from 'vitest';
import { pngFileFromDataUrl, type QrPixels, renderQrPixels, saveQrImage } from './qrImage';

// Un payload con la forma de un QR interoperable boliviano (EMVCo): campos
// tag-length-value y un CRC al final.
const PAYLOAD = '00020101021226580014BR.GOV.BCB.PIX0136vaquita@example.com5204000053039865802BO6304ABCD';

const FILE = new File([new Uint8Array([1, 2, 3])], 'vaquita-qr.png', { type: 'image/png' });

describe('renderQrPixels', () => {
  it('encodes a payment payload that a scanner reads back unchanged', () => {
    const payload = PAYLOAD;

    const image = renderQrPixels(payload);

    const decoded = jsQR(image.data, image.width, image.height);
    expect(decoded?.data).toBe(payload);
  });

  // El nombre del comercio viaja dentro del payload y en Bolivia lleva acentos.
  // Con el encoder por defecto de la librería el código sale ilegible, y eso no
  // se ve en pantalla: el usuario se entera recién en la app del banco, con los
  // bolivianos ya puestos.
  it('keeps accented merchant names intact', () => {
    const payload = '00020101021159020014Café Potosí S.A.5802BO6304ABCD';

    const image = renderQrPixels(payload, { size: 256 });

    expect(jsQR(image.data, image.width, image.height)?.data).toBe(payload);
  });

  it('is exactly the requested pixel size, and still scannable at it', () => {
    const image = renderQrPixels(PAYLOAD, { size: 512 });

    expect([image.width, image.height]).toEqual([512, 512]);
    expect(image.data.length).toBe(512 * 512 * 4);
    expect(jsQR(image.data, image.width, image.height)?.data).toBe(PAYLOAD);
  });

  it('surrounds the code with the quiet zone a scanner needs to find it', () => {
    const image = renderQrPixels(PAYLOAD, { size: 512 });

    // El módulo se mide sobre la propia imagen: la barra superior del patrón de
    // búsqueda de arriba a la izquierda mide 7 módulos por definición del
    // formato, así que el primer tramo oscuro dividido 7 da el lado del módulo.
    const top = firstDarkRow(image);
    const moduleSize = firstDarkRunLength(image, top) / 7;
    expect(moduleSize).toBeGreaterThan(0);

    for (const margin of margins(image)) {
      expect(margin).toBeGreaterThanOrEqual(4 * moduleSize);
    }
  });

  // El QR termina en la galería del teléfono y de ahí en la app del banco: no
  // hay tema oscuro que lo compense ni fondo detrás que lo tape. Por eso la
  // función no recibe ningún color y siempre pinta negro sobre blanco opaco.
  it('is opaque black on white, with no colour or transparency to inherit a theme', () => {
    const image = renderQrPixels(PAYLOAD, { size: 128 });

    const corners = [
      [0, 0],
      [image.width - 1, 0],
      [0, image.height - 1],
      [image.width - 1, image.height - 1],
    ];
    for (const [x, y] of corners) {
      expect(pixel(image, x, y)).toEqual([255, 255, 255, 255]);
    }

    for (let i = 0; i < image.data.length; i += 4) {
      const [r, g, b, a] = [image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]];
      expect(a).toBe(255);
      expect(r).toBe(g);
      expect(g).toBe(b);
      expect([0, 255]).toContain(r);
    }
  });
});

describe('pngFileFromDataUrl', () => {
  it('turns the provider data URL into a shareable PNG file with the same bytes', async () => {
    const file = pngFileFromDataUrl('data:image/png;base64,aGk=', 'vaquita-qr.png');

    expect(file?.name).toBe('vaquita-qr.png');
    expect(file?.type).toBe('image/png');
    expect(new Uint8Array(await file!.arrayBuffer())).toEqual(new Uint8Array([104, 105])); // "hi"
  });

  it('keeps the JPEG the provider actually sends, with a matching extension', async () => {
    const file = pngFileFromDataUrl('data:image/jpeg;base64,aGk=', 'vaquita-qr.png');

    expect(file?.name).toBe('vaquita-qr.jpg');
    expect(file?.type).toBe('image/jpeg');
    expect(new Uint8Array(await file!.arrayBuffer())).toEqual(new Uint8Array([104, 105]));
  });

  it('refuses anything that is not a base64 bitmap, rather than sharing a broken file', () => {
    // Un SVG no va a Fotos y un base64 roto daría un archivo que no abre; en los
    // dos casos queda el long-press sobre la imagen, que sigue funcionando.
    expect(pngFileFromDataUrl('data:image/svg+xml;utf8,%3Csvg%3E', 'qr.png')).toBeNull();
    expect(pngFileFromDataUrl('data:image/png;base64,@@no-base64@@', 'qr.png')).toBeNull();
  });
});

describe('saveQrImage', () => {
  it('downloads the file even on a device that could share it', async () => {
    // El botón dice "guardar". Abrir la hoja de compartir teniendo cómo bajar el
    // archivo le pedía al usuario elegir app y buscar "Guardar imagen" adentro.
    const clicks: { href: string; download: string }[] = [];
    const anchor = {
      href: '',
      download: '',
      click: () => clicks.push({ href: anchor.href, download: anchor.download }),
    };
    const shared: File[][] = [];
    const platform = {
      navigator: {
        canShare: () => true,
        share: async ({ files }: { files: File[] }) => {
          shared.push(files);
        },
      },
      document: { createElement: () => anchor },
      createObjectURL: () => 'blob:qr',
    };

    const outcome = await saveQrImage(FILE, platform);

    expect(outcome).toBe('downloaded');
    expect(clicks).toEqual([{ href: 'blob:qr', download: 'vaquita-qr.png' }]);
    expect(shared).toEqual([]);
  });

  it('falls back to the share sheet when the device cannot download', async () => {
    const shared: File[][] = [];
    const platform = {
      navigator: {
        canShare: () => true,
        share: async ({ files }: { files: File[] }) => {
          shared.push(files);
        },
      },
    };

    const outcome = await saveQrImage(FILE, platform);

    expect(outcome).toBe('shared');
    expect(shared).toEqual([[FILE]]);
  });

  // Es el caso de Safari en iOS: ni compartir archivos ni un `<a download>` que
  // funcione. Decirlo en vez de fallar en silencio es lo que deja a la pantalla
  // pedirle al usuario que mantenga presionada la imagen para guardarla.
  it('reports that nothing can save the file, so the caller can ask for a long press', async () => {
    const noAnchor = { href: '', click: () => {} };

    expect(await saveQrImage(FILE, {})).toBe('manual');
    expect(await saveQrImage(FILE, { navigator: {} })).toBe('manual');
    expect(await saveQrImage(FILE, { navigator: { share: async () => {} } })).toBe('manual');
    expect(
      await saveQrImage(FILE, { document: { createElement: () => noAnchor as never }, createObjectURL: () => 'blob:qr' }),
    ).toBe('manual');
    expect(await saveQrImage(FILE, { document: { createElement: () => ({ href: '', download: '', click: () => {} }) } })).toBe(
      'manual',
    );
  });
});

// --- Ayudas de medición sobre los píxeles, para no espiar la implementación ---

const isDark = (image: QrPixels, x: number, y: number) => image.data[(y * image.width + x) * 4] < 128;

const pixel = (image: QrPixels, x: number, y: number): number[] =>
  Array.from(image.data.slice((y * image.width + x) * 4, (y * image.width + x) * 4 + 4));

/** Primera fila que tiene algún píxel oscuro. */
function firstDarkRow(image: QrPixels): number {
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) if (isDark(image, x, y)) return y;
  }
  throw new Error('the image has no dark pixels at all');
}

/** Largo del primer tramo oscuro continuo de una fila. */
function firstDarkRunLength(image: QrPixels, y: number): number {
  let x = 0;
  while (x < image.width && !isDark(image, x, y)) x++;
  let run = 0;
  while (x + run < image.width && isDark(image, x + run, y)) run++;
  return run;
}

/** Distancia en píxeles de cada borde al primer píxel oscuro: [arriba, abajo, izq, der]. */
function margins(image: QrPixels): number[] {
  const dark: { x: number; y: number }[] = [];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) if (isDark(image, x, y)) dark.push({ x, y });
  }
  const xs = dark.map((p) => p.x);
  const ys = dark.map((p) => p.y);
  return [
    Math.min(...ys),
    image.height - 1 - Math.max(...ys),
    Math.min(...xs),
    image.width - 1 - Math.max(...xs),
  ];
}
