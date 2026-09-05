/**
 * Prepara una imagen elegida por el usuario para mandarla adjunta en un reporte.
 *
 * El archivo original no se sube nunca: una captura de un celular moderno son
 * varios MB y 3000px de ancho, y lo que necesita quien triagea es ver la
 * pantalla, no contar píxeles. Se reescala al lado mayor de `MAX_SIDE` y se
 * recomprime a JPEG, que para una captura de UI baja de megabytes a decenas de
 * kilobytes sin perder nada legible.
 *
 * El PNG se convierte a JPEG igual que el resto. La transparencia no sobrevive,
 * y está bien: se pinta fondo blanco antes de dibujar, así un PNG con alfa no
 * termina con el fondo negro que deja el canvas por defecto.
 *
 * El tope del backend es 2 MB por imagen (`ATTACHMENT_BYTES_MAX`); si aun
 * reescalada no entra —una foto enorme con mucho detalle— se reintenta con menos
 * calidad antes de rendirse, para no rebotarle al usuario una captura válida.
 */
const MAX_SIDE = 1280;
const MAX_BYTES = 2 * 1024 * 1024;
const QUALITY_STEPS = [0.82, 0.7, 0.55];

export const ATTACHMENT_ACCEPT = 'image/png,image/jpeg,image/webp';

export type PreparedAttachment = {
  /** Data URL JPEG, lista para `<img src>` en la preview y para el POST. */
  dataUrl: string;
  bytes: number;
};

/** Tamaño aproximado en bytes de lo que codifica un data URL base64. */
const decodedSize = (dataUrl: string): number => {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
};

const loadImage = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    // Se revoca en los dos caminos: si no, cada intento fallido deja un blob
    // colgado en memoria hasta que se recarga la pestaña.
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable-image'));
    };
    img.src = url;
  });

/**
 * Devuelve la imagen reescalada y comprimida, o `null` si el archivo no se pudo
 * leer o no entra en el tope ni con la calidad más baja. `null` en vez de una
 * excepción porque el llamador siempre quiere mostrar el mismo mensaje.
 */
export async function prepareAttachment(file: File): Promise<PreparedAttachment | null> {
  if (!file.type.startsWith('image/')) return null;

  let img: HTMLImageElement;
  try {
    img = await loadImage(file);
  } catch {
    return null;
  }

  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);

  for (const quality of QUALITY_STEPS) {
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const bytes = decodedSize(dataUrl);
    if (bytes <= MAX_BYTES) return { dataUrl, bytes };
  }

  return null;
}
