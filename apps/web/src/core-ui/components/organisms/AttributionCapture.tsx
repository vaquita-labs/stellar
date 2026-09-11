'use client';

import { clientEnv } from '@/core-ui/config/clientEnv';
import { authFetch } from '@/networks/stellar/walletSession';
import { useEffect, useRef } from 'react';
import { useConfigStore } from '../../stores';

/**
 * Atribución de campaña, en dos mitades, por el mismo motivo que
 * `FollowDeepLink`: el dato llega en la URL de un visitante anónimo y el perfil
 * donde hay que guardarlo todavía no existe.
 *
 * - `AttributionCapture` corre en el layout raíz, en la PRIMERA visita, antes
 *   de cualquier gate. Lee `?ref=` y los `utm_*`, y los guarda en localStorage.
 * - `AttributionFlush` corre ya autenticado: manda el blob una vez y lo borra.
 *
 * Gana el PRIMER toque: si ya hay algo guardado no se pisa, así una visita
 * orgánica posterior no le roba la conversión a la campaña que trajo al usuario.
 * El backend aplica la misma regla del lado del perfil, que es la que de verdad
 * cuenta — el localStorage se borra y esto se puede reintentar desde otro
 * dispositivo.
 */

const ATTRIBUTION_KEY = 'vaquita.attribution';

type AttributionBlob = {
  code?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  referrer?: string;
  landedAt?: string;
};

/** Recorte defensivo: el servidor vuelve a validar, esto es para no llenar el storage. */
const take = (value: string | null, max = 200): string | undefined => {
  const trimmed = value?.trim().slice(0, max);
  return trimmed || undefined;
};

export function AttributionCapture() {
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(ATTRIBUTION_KEY);
    } catch {
      // Storage bloqueado (modo privado): sin persistencia no hay atribución
      // que sobreviva al login, y no vale la pena degradar a nada más raro.
      return;
    }
    // Primer toque gana: si ya hay blob, ni miramos la URL.
    if (stored) return;

    const params = new URLSearchParams(window.location.search);
    const blob: AttributionBlob = {};

    // En minúsculas: el código es un vaquitatag y los tags se guardan así. La
    // resolución en el servidor no distingue mayúsculas —los códigos viejos,
    // aleatorios, eran en mayúsculas y esos links siguen andando—, así que esto
    // sólo decide cómo queda guardado el blob.
    const code = take(params.get('ref'), 32);
    if (code) blob.code = code.toLowerCase();
    const utmSource = take(params.get('utm_source'));
    if (utmSource) blob.utmSource = utmSource;
    const utmMedium = take(params.get('utm_medium'));
    if (utmMedium) blob.utmMedium = utmMedium;
    const utmCampaign = take(params.get('utm_campaign'));
    if (utmCampaign) blob.utmCampaign = utmCampaign;
    const utmContent = take(params.get('utm_content'));
    if (utmContent) blob.utmContent = utmContent;
    const utmTerm = take(params.get('utm_term'));
    if (utmTerm) blob.utmTerm = utmTerm;

    // Sin ningún parámetro no se guarda nada: un blob que solo dice "vino del
    // referrer X" no atribuye a nadie y ocuparía el lugar del primer toque real.
    if (Object.keys(blob).length === 0) return;

    const referrer = take(document.referrer, 500);
    if (referrer) blob.referrer = referrer;
    blob.landedAt = new Date().toISOString();

    try {
      localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(blob));
    } catch {
      // Ídem: sin storage no hay nada que hacer acá.
    }
  }, []);

  return null;
}

export function AttributionFlush() {
  const { walletAddress } = useConfigStore();
  // Un intento por montaje. El blob se borra antes de la request: si el POST
  // falla se pierde la atribución de ESE aterrizaje, que es mejor que
  // reintentar en cada navegación contra un endpoint que ya dijo que no.
  const sentRef = useRef(false);

  useEffect(() => {
    if (!walletAddress || sentRef.current) return;

    let raw: string | null = null;
    try {
      raw = localStorage.getItem(ATTRIBUTION_KEY);
    } catch {
      return;
    }
    if (!raw) return;
    sentRef.current = true;

    let blob: AttributionBlob;
    try {
      blob = JSON.parse(raw) as AttributionBlob;
    } catch {
      // Blob corrupto (una versión vieja del formato, alguien tocando el
      // storage): se tira y listo, no hay nada que reparar.
      try {
        localStorage.removeItem(ATTRIBUTION_KEY);
      } catch {
        /* nada que hacer */
      }
      return;
    }

    try {
      localStorage.removeItem(ATTRIBUTION_KEY);
    } catch {
      /* nada que hacer */
    }

    void (async () => {
      try {
        await authFetch(
          `${clientEnv.NEXT_PUBLIC_SERVICES_URL}/api/v1/attribution`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(blob),
          },
          walletAddress,
        );
      } catch {
        // Silencioso a propósito: esto es telemetría de marketing, y no hay
        // ninguna versión de este error que le sirva al usuario.
      }
    })();
  }, [walletAddress]);

  return null;
}
