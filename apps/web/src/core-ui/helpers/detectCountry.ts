/**
 * De dónde está el usuario, para SUGERIR un país — nunca para elegirlo por él.
 *
 * Las tres señales mienten de maneras distintas: la cookie sale de la IP y una
 * VPN la manda a otro continente, la zona horaria sale del sistema operativo y
 * sobrevive a esa VPN pero no a un viaje, y el idioma dice preferencia y no
 * ubicación. Ninguna alcanza para meter a alguien en un corredor de fiat con
 * plata de por medio, así que lo único que se hace con el resultado es ordenar
 * la lista y marcar una fila.
 */

/** Nombre de la cookie que el proxy escribe con el país de la IP. */
export const COUNTRY_COOKIE = 'vq_country';

/**
 * Qué señal resolvió el país. Viaja en los eventos: si `cookie` no aparece nunca
 * en producción es que el proxy de arriba todavía no manda el header de país y
 * lo que se está midiendo es la puntería de los fallbacks.
 */
export type CountrySource = 'cookie' | 'timezone' | 'language';

export interface DetectedCountry {
  /** ISO 3166-1 alpha-2 en mayúsculas. */
  country: string;
  source: CountrySource;
}

/** Señales del browser. Se pasan como argumento para poder testear sin DOM. */
export interface CountrySignals {
  /** `document.cookie` entero, tal cual. */
  cookie?: string | null;
  timeZone?: string | null;
  language?: string | null;
}

/**
 * Un código sirve si son dos letras y no es el `XX` que manda Cloudflare cuando
 * no pudo geolocalizar el tráfico (Tor, por ejemplo).
 */
const normalizeCode = (value: string | null | undefined): string | null => {
  const code = value?.trim().toUpperCase();
  if (!code || !/^[A-Z]{2}$/.test(code) || code === 'XX') return null;
  return code;
};

/** Zonas horarias de los países que ofrece el picker. */
const TIME_ZONE_COUNTRY: Record<string, string> = {
  'America/La_Paz': 'BO',
  'America/Bogota': 'CO',
  'America/Lima': 'PE',
  'America/Araguaina': 'BR',
  'America/Bahia': 'BR',
  'America/Belem': 'BR',
  'America/Boa_Vista': 'BR',
  'America/Campo_Grande': 'BR',
  'America/Cuiaba': 'BR',
  'America/Eirunepe': 'BR',
  'America/Fortaleza': 'BR',
  'America/Maceio': 'BR',
  'America/Manaus': 'BR',
  'America/Noronha': 'BR',
  'America/Porto_Velho': 'BR',
  'America/Recife': 'BR',
  'America/Rio_Branco': 'BR',
  'America/Santarem': 'BR',
  'America/Sao_Paulo': 'BR',
  'America/Bahia_Banderas': 'MX',
  'America/Cancun': 'MX',
  'America/Chihuahua': 'MX',
  'America/Ciudad_Juarez': 'MX',
  'America/Hermosillo': 'MX',
  'America/Matamoros': 'MX',
  'America/Mazatlan': 'MX',
  'America/Merida': 'MX',
  'America/Mexico_City': 'MX',
  'America/Monterrey': 'MX',
  'America/Ojinaga': 'MX',
  'America/Tijuana': 'MX',
  // Nombres viejos que todavía reporta algún sistema operativo.
  'America/Buenos_Aires': 'AR',
  'America/Cordoba': 'AR',
  'America/Mendoza': 'AR',
  'America/Rosario': 'AR',
};

export const countryFromCookie = (cookieHeader: string | null | undefined): string | null => {
  if (!cookieHeader) return null;
  const match = new RegExp(`(?:^|;\\s*)${COUNTRY_COOKIE}=([^;]*)`).exec(cookieHeader);
  return normalizeCode(match?.[1] ? decodeURIComponent(match[1]) : null);
};

export const countryFromTimeZone = (timeZone: string | null | undefined): string | null => {
  const zone = timeZone?.trim();
  if (!zone) return null;
  // Argentina publica una zona por provincia bajo el mismo prefijo.
  if (zone.startsWith('America/Argentina/')) return 'AR';
  return TIME_ZONE_COUNTRY[zone] ?? null;
};

/**
 * Región de un tag BCP-47: `es-AR` -> `AR`, `zh-Hans-CN` -> `CN`. Un idioma sin
 * región (`es`, `pt`) o con una región que no es un país (`es-419`, Latinoamérica
 * entera) no dice dónde está nadie, así que se descarta en vez de adivinar el
 * país más poblado que lo habla.
 */
export const countryFromLanguage = (language: string | null | undefined): string | null => {
  const subtags = language?.trim().split(/[-_]/) ?? [];
  const region = subtags.slice(1).find((subtag) => /^[A-Za-z]{2}$/.test(subtag));
  return normalizeCode(region);
};

/**
 * La cookie va primero porque es la misma señal con la que el proxy decide el
 * geobloqueo: si las dos capas van a hablar del usuario, que hablen de lo mismo.
 * Las otras dos sólo entran cuando no hay cookie —hoy, sin el header configurado
 * arriba, es el caso normal—.
 */
export function detectCountry(signals: CountrySignals): DetectedCountry | null {
  const fromCookie = countryFromCookie(signals.cookie);
  if (fromCookie) return { country: fromCookie, source: 'cookie' };

  const fromTimeZone = countryFromTimeZone(signals.timeZone);
  if (fromTimeZone) return { country: fromTimeZone, source: 'timezone' };

  const fromLanguage = countryFromLanguage(signals.language);
  if (fromLanguage) return { country: fromLanguage, source: 'language' };

  return null;
}
