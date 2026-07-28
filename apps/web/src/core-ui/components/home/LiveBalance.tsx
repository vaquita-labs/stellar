'use client';

import { AMOUNT_DECIMALS, floorAmount } from '@/core-ui/helpers/numbers';
import { subscribeLiveTick } from '@/core-ui/hooks';
import { useEffect, useRef, useState } from 'react';

/**
 * Una fuente de interés que avanza sola: rinde `ratePerMs` desde `anchor` (un
 * epoch ya expresado en el reloj del CLIENTE) y nunca pasa de `maxInterest`.
 * Sirve igual para un lock de Vaquita (tope = interés proyectado al vencimiento)
 * que para la posición en Blend (sin tope: `Infinity`).
 */
export type AccrualTerm = {
  ratePerMs: number;
  maxInterest: number;
  anchor: number;
};

/** Interés devengado por todos los términos a la hora `now`. */
export const accruedAt = (terms: AccrualTerm[], now: number) =>
  terms.reduce((acc, term) => acc + Math.min(term.maxInterest, term.ratePerMs * Math.max(0, now - term.anchor)), 0);

/**
 * Con plata NUNCA redondeamos hacia arriba: `floorAmount` PISA a los 7 decimales
 * nativos de USDC (nunca $6.0000000 con $5.9999995 reales), igual que el
 * "Available" del retiro y el total del portfolio.
 *
 * El saldo se parte en dos para que el layout sea ESTABLE mientras tickea: los
 * dólares y centavos van grandes (solo cambian de ancho al sumar un dígito
 * entero, algo rarísimo) y la precisión sub-centavo va chica y tenue al lado.
 * Los 5 decimales restantes SIEMPRE se muestran, incluso en ceros ($0.00 →
 * "00000"): así el saldo no queda "pelado" cuando es redondo y el ancho es casi
 * constante, que es lo que hace que la pastilla no salte.
 */
export const formatLiveBalance = (value: number) => {
  const [int, dec = ''] = floorAmount(value, AMOUNT_DECIMALS).toFixed(AMOUNT_DECIMALS).split('.');
  return { big: `$${Number(int).toLocaleString()}.${dec.slice(0, 2)}`, sub: dec.slice(2) };
};

/**
 * El saldo total moviéndose en vivo: `base` (lo quieto: capital de los locks +
 * snapshot de Blend) + lo que devengan los `terms` hasta este instante.
 *
 * El contador NO vive en el estado de React: en cada tick se escribe el
 * `textContent` de los dos <span> por ref. Es plata que avanza 4 veces por
 * segundo y el header cuelga del mismo árbol que el mapa 3D; un setState acá
 * re-renderizaba media pantalla y, peor, abortaba la navegación de <Link> (que
 * corre en una transition, ver `useLiveTick`) — tocar el avatar no hacía nada.
 * Pintando el DOM directo, el tick cuesta dos asignaciones y cero renders.
 *
 * Por eso los <span> se montan con el valor inicial congelado y nunca vuelven a
 * recibir children: React diffea contra su propio VDOM, así que no pisa lo que
 * escribimos por ref. Si alguna vez hay que meter el saldo en el render, hay que
 * rehacer esto entero, no "arreglar" el children.
 */
export const LiveBalance = ({ base, terms }: { base: number; terms: AccrualTerm[] }) => {
  const bigRef = useRef<HTMLSpanElement>(null);
  const subRef = useRef<HTMLSpanElement>(null);
  // Solo para el primer paint (y el HTML del server): así la pastilla nace con
  // el número correcto en vez de vacía y con el ancho saltando en el frame 2.
  const [initial] = useState(() => formatLiveBalance(base + accruedAt(terms, Date.now())));

  useEffect(() => {
    const paint = () => {
      const { big, sub } = formatLiveBalance(base + accruedAt(terms, Date.now()));
      if (bigRef.current) bigRef.current.textContent = big;
      if (subRef.current) subRef.current.textContent = sub;
    };
    // Repinta ya: `base`/`terms` acaban de cambiar (llegó data) y el valor
    // congelado del render inicial quedó viejo.
    paint();
    return subscribeLiveTick(paint);
  }, [base, terms]);

  return (
    <>
      <span ref={bigRef} className="text-xl">
        {initial.big}
      </span>
      <span ref={subRef} className="text-sm text-black/40">
        {initial.sub}
      </span>
    </>
  );
};
