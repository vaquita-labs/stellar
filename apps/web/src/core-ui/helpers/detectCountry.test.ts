import { describe, expect, it } from 'vitest';
import { countryFromCookie, countryFromLanguage, countryFromTimeZone, detectCountry } from './detectCountry';

describe('countryFromCookie', () => {
  it('reads the country the proxy wrote, ignoring the other cookies around it', () => {
    expect(countryFromCookie('foo=1; vq_country=AR; bar=2')).toBe('AR');
  });

  it('reads it when it is the first cookie of the header', () => {
    expect(countryFromCookie('vq_country=BO')).toBe('BO');
  });

  it('does not match a cookie whose name merely ends with the same text', () => {
    expect(countryFromCookie('not_vq_country=AR')).toBeNull();
  });

  it('yields nothing when Cloudflare could not geolocate the traffic', () => {
    // 'XX' es un valor real del header, no basura: sugerir un país con él sería
    // sugerir cualquiera.
    expect(countryFromCookie('vq_country=XX')).toBeNull();
  });

  it('yields nothing when there are no cookies at all', () => {
    expect(countryFromCookie('')).toBeNull();
    expect(countryFromCookie(undefined)).toBeNull();
  });
});

describe('countryFromTimeZone', () => {
  it('resolves every Argentine province from the shared prefix', () => {
    expect(countryFromTimeZone('America/Argentina/Buenos_Aires')).toBe('AR');
    expect(countryFromTimeZone('America/Argentina/Ushuaia')).toBe('AR');
  });

  it('resolves the countries the picker offers', () => {
    expect(countryFromTimeZone('America/La_Paz')).toBe('BO');
    expect(countryFromTimeZone('America/Sao_Paulo')).toBe('BR');
    expect(countryFromTimeZone('America/Bogota')).toBe('CO');
    expect(countryFromTimeZone('America/Lima')).toBe('PE');
    expect(countryFromTimeZone('America/Mexico_City')).toBe('MX');
  });

  it('resolves the legacy zone names some systems still report', () => {
    expect(countryFromTimeZone('America/Buenos_Aires')).toBe('AR');
  });

  it('yields nothing for a zone outside the list', () => {
    expect(countryFromTimeZone('Europe/Madrid')).toBeNull();
  });

  it('yields nothing when the browser reports no zone', () => {
    // Safari viejo devuelve undefined en `resolvedOptions().timeZone`.
    expect(countryFromTimeZone(undefined)).toBeNull();
    expect(countryFromTimeZone('')).toBeNull();
  });
});

describe('countryFromLanguage', () => {
  it('takes the region of the tag', () => {
    expect(countryFromLanguage('es-AR')).toBe('AR');
    expect(countryFromLanguage('pt-BR')).toBe('BR');
  });

  it('takes the region even when a script subtag comes first', () => {
    expect(countryFromLanguage('zh-Hans-CN')).toBe('CN');
  });

  it('yields nothing for a language with no region', () => {
    expect(countryFromLanguage('es')).toBeNull();
  });

  it('yields nothing for a region that is not a country', () => {
    // 'es-419' es Latinoamérica entera: elegir uno de sus veinte países sería
    // inventar.
    expect(countryFromLanguage('es-419')).toBeNull();
  });
});

describe('detectCountry', () => {
  it('prefers the cookie, which is the signal the geoblock also reads', () => {
    expect(detectCountry({ cookie: 'vq_country=CO', timeZone: 'America/La_Paz', language: 'es-AR' })).toEqual({
      country: 'CO',
      source: 'cookie',
    });
  });

  it('falls back to the time zone when there is no cookie', () => {
    // El caso de hoy: el proxy de arriba todavía no manda el header de país.
    expect(detectCountry({ timeZone: 'America/La_Paz', language: 'es-AR' })).toEqual({
      country: 'BO',
      source: 'timezone',
    });
  });

  it('falls back to the language when the time zone says nothing', () => {
    expect(detectCountry({ timeZone: 'Europe/Madrid', language: 'es-AR' })).toEqual({
      country: 'AR',
      source: 'language',
    });
  });

  it('yields nothing when no signal resolves, so the list stays as it is', () => {
    expect(detectCountry({ timeZone: 'Europe/Madrid', language: 'es' })).toBeNull();
    expect(detectCountry({})).toBeNull();
  });
});
