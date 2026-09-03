import qrcode from 'qrcode-generator';

/** Imagen en crudo: RGBA, una fila tras otra, como la espera un canvas. */
export interface QrPixels {
  width: number;
  height: number;
  /** El buffer se fija a `ArrayBuffer` para que `ImageData` lo acepte tal cual. */
  data: Uint8ClampedArray<ArrayBuffer>;
}

export interface RenderOpts {
  /** Lado de la imagen en píxeles. Se respeta exacto. */
  size?: number;
}

/**
 * Margen blanco alrededor del código, en módulos. Cuatro es el mínimo que pide
 * la norma: con menos, un escáner no encuentra dónde empieza el código.
 */
const QUIET_ZONE_MODULES = 4;

/** Suficiente para que un escáner lo lea desde la galería de un teléfono. */
const DEFAULT_SIZE = 512;

// El encoder que trae la librería por defecto no es UTF-8, y el nombre del
// comercio viaja dentro del payload: en Bolivia lleva acentos, y sin esto el
// código sale ilegible sin ninguna señal en pantalla. `stringToBytes` es el
// punto de extensión que la propia librería expone para reemplazarlo.
qrcode.stringToBytes = (value: string) => Array.from(new TextEncoder().encode(value));

/**
 * Rasteriza un payload de pago a un QR propio.
 *
 * No usamos la imagen del proveedor a propósito: puede venir como SVG dibujado
 * con `currentColor` —que iOS no guarda en Fotos y que en tema oscuro sale
 * ilegible—, y el usuario recién se entera de que el código no escanea cuando ya
 * está frente a la app del banco con la plata puesta. Reencodear desde el
 * payload crudo saca al proveedor de esa ecuación.
 */
export function renderQrPixels(payload: string, opts: RenderOpts = {}): QrPixels {
  const size = opts.size ?? DEFAULT_SIZE;

  const qr = qrcode(0, 'M');
  qr.addData(payload);
  qr.make();
  const modules = qr.getModuleCount();

  // El lado pedido se respeta exacto (es lo que se guarda en la galería), así
  // que el módulo se redondea hacia abajo y lo que sobra se reparte como margen.
  // Al revés —estirar el módulo— daría filas de distinto ancho y escáneres que
  // fallan de a ratos.
  const scale = Math.max(1, Math.floor(size / (modules + QUIET_ZONE_MODULES * 2)));
  const width = size;
  const height = size;
  const margin = Math.floor((size - modules * scale) / 2);

  // Blanco opaco de fondo SIEMPRE, sin mirar el tema activo: el QR viaja a la
  // galería y de ahí a la app del banco, donde no existe ningún tema oscuro que
  // lo compense.
  const data = new Uint8ClampedArray(new ArrayBuffer(width * height * 4)).fill(255);

  for (let row = 0; row < modules; row++) {
    for (let col = 0; col < modules; col++) {
      if (!qr.isDark(row, col)) continue;
      const top = margin + row * scale;
      const left = margin + col * scale;
      for (let y = top; y < top + scale; y++) {
        const rowOffset = y * width * 4;
        for (let x = left; x < left + scale; x++) {
          const offset = rowOffset + x * 4;
          data[offset] = 0;
          data[offset + 1] = 0;
          data[offset + 2] = 0;
        }
      }
    }
  }

  return { width, height, data };
}

/**
 * El bitmap del proveedor (data URL base64, PNG o JPEG) como File, para
 * compartirlo o guardarlo igual que el QR propio. Stereum no publica el payload
 * crudo —manda el código ya dibujado— así que este es el único camino a la
 * galería en ese corredor. Null si el src no es un bitmap base64: un SVG no va
 * a Fotos, y sin archivo la pantalla igual sirve con el long-press sobre la
 * imagen. La extensión del archivo sigue al tipo real.
 */
export function pngFileFromDataUrl(src: string, filename: string): File | null {
  const match = /^data:(image\/(?:png|jpeg));base64,/.exec(src);
  if (!match) return null;
  const type = match[1];
  try {
    const bytes = Uint8Array.from(atob(src.slice(match[0].length)), (c) => c.charCodeAt(0));
    const name = type === 'image/jpeg' ? filename.replace(/\.png$/, '.jpg') : filename;
    return new File([bytes], name, { type });
  } catch {
    return null;
  }
}

/** Qué terminó pasando al intentar guardar. */
export type SaveOutcome = 'shared' | 'downloaded' | 'manual';

interface ShareLike {
  files: File[];
}

/** Lo mínimo de un `<a>` que hace falta para disparar una descarga. */
interface AnchorLike {
  href: string;
  download: string;
  click: () => void;
}

/**
 * Lo que el módulo necesita del navegador para guardar. Va como parámetro —y no
 * leído de los globales— porque las tres estrategias sólo se distinguen por qué
 * capacidades existen, y así se puede probar cada una sin un navegador.
 */
export interface SavePlatform {
  navigator?: {
    canShare?: (data: ShareLike) => boolean;
    share?: (data: ShareLike) => Promise<void>;
  };
  document?: { createElement: (tag: 'a') => AnchorLike };
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
}

/**
 * Guarda el QR en el dispositivo, eligiendo la estrategia por lo que soporte el
 * navegador. Requiere un gesto del usuario: tanto descargar como compartir se
 * bloquean si se llaman fuera de un click.
 *
 * La descarga va PRIMERO. Compartir arranca antes lo abría la hoja de compartir
 * del sistema, que es otra cosa que lo que pide el botón: el usuario tocaba
 * "Guardar" y le aparecía una lista de apps a las que mandar el código, con
 * "Guardar imagen" escondido entre ellas y un toque más lejos. Un `<a download>`
 * deja el archivo en el dispositivo sin preguntar nada, que es lo que el botón
 * promete.
 *
 * Compartir queda de respaldo para los navegadores donde la descarga no existe
 * (sin `createObjectURL` o con un `<a>` sin `download`): ahí la hoja de
 * compartir sigue siendo el único camino a la galería.
 */
export async function saveQrImage(file: File, platform: SavePlatform = browserPlatform()): Promise<SaveOutcome> {
  const anchor = platform.document?.createElement('a');
  // `download` puede no existir: ahí el click abriría la imagen en vez de
  // guardarla, que es peor que no ofrecer el botón.
  if (anchor && platform.createObjectURL && 'download' in anchor) {
    const url = platform.createObjectURL(file);
    anchor.href = url;
    anchor.download = file.name;
    anchor.click();
    // El revoke va diferido: hacerlo en la misma vuelta del click deja a algunos
    // navegadores con la descarga a medio empezar y sin archivo.
    setTimeout(() => platform.revokeObjectURL?.(url), 0);
    return 'downloaded';
  }

  const nav = platform.navigator;
  // `canShare({ files })` es el único chequeo confiable: hay navegadores con
  // `share` que igual rechazan archivos.
  if (nav?.share && nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file] });
    return 'shared';
  }

  return 'manual';
}

/** Las capacidades reales del navegador, o ninguna si no estamos en uno. */
export function browserPlatform(): SavePlatform {
  if (typeof window === 'undefined') return {};
  return {
    navigator: {
      canShare: navigator.canShare?.bind(navigator),
      share: navigator.share?.bind(navigator),
    },
    document: { createElement: (tag) => document.createElement(tag) },
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
  };
}

/**
 * El QR como PNG listo para mostrar en un `<img>`, compartir o descargar.
 *
 * Es la capa fina de canvas sobre `renderQrPixels`: PNG y no SVG porque iOS no
 * guarda SVG en Fotos, que es justamente donde el usuario necesita el código
 * para abrirlo desde la app del banco.
 */
export async function renderQrPngFile(payload: string, filename: string, opts: RenderOpts = {}): Promise<File> {
  const image = renderQrPixels(payload, opts);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('el navegador no expone un canvas 2d para dibujar el QR');
  context.putImageData(new ImageData(image.data, image.width, image.height), 0, 0);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('el navegador no pudo codificar el QR como PNG');
  return new File([blob], filename, { type: 'image/png' });
}
