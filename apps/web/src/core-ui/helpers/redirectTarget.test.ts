import { describe, expect, it } from 'vitest';
import { internalRedirect } from './redirectTarget';

const ORIGIN = 'https://app.vaquita.fi';

describe('internalRedirect', () => {
  it('devuelve la ruta interna tal cual, con su query', () => {
    expect(internalRedirect('/transactions', ORIGIN)).toBe('/transactions');
    expect(internalRedirect('/transactions?tx=abc123', ORIGIN)).toBe('/transactions?tx=abc123');
    expect(internalRedirect('/portafolio?period=30d#top', ORIGIN)).toBe('/portafolio?period=30d#top');
  });

  it('rechaza el protocol-relative, que empieza por "/" y sale del sitio', () => {
    // Comprobado contra la app corriendo: el router lo sigue hasta el otro
    // dominio, así que el chequeo de "empieza por /" no alcanzaba.
    expect(internalRedirect('//example.com', ORIGIN)).toBeNull();
    expect(internalRedirect('//example.com/algo', ORIGIN)).toBeNull();
  });

  it('rechaza la barra invertida, que el navegador acepta igual', () => {
    expect(internalRedirect('/\\example.com', ORIGIN)).toBeNull();
    expect(internalRedirect('\\\\example.com', ORIGIN)).toBeNull();
  });

  it('rechaza cualquier URL absoluta a otro origen', () => {
    expect(internalRedirect('https://example.com/home', ORIGIN)).toBeNull();
    expect(internalRedirect('http://app.vaquita.fi/home', ORIGIN)).toBeNull(); // otro esquema, otro origen
    expect(internalRedirect('javascript:alert(1)', ORIGIN)).toBeNull();
  });

  it('acepta la URL absoluta al MISMO origen y la devuelve relativa', () => {
    expect(internalRedirect(`${ORIGIN}/transactions?tx=1`, ORIGIN)).toBe('/transactions?tx=1');
  });

  it('sin valor no hay destino', () => {
    expect(internalRedirect(null, ORIGIN)).toBeNull();
    expect(internalRedirect(undefined, ORIGIN)).toBeNull();
    expect(internalRedirect('', ORIGIN)).toBeNull();
  });
});
