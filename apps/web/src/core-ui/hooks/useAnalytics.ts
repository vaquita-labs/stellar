'use client';

import { isPostHogEnabled } from '@/core-ui/config/featureFlags';
import posthog from 'posthog-js';

type AllowedPropertyValues = string | number | boolean | null;

/**
 * Eventos de producto. Antes esto llamaba a `track()` de `@vercel/analytics`,
 * que en Dokploy no tiene backend: todos los eventos se tiraban en silencio.
 * Ahora va a PostHog.
 *
 * Los nombres de los helpers no cambian —los call sites quedan iguales— pero sí
 * la FORMA del evento: cada uno se manda con su propio nombre en vez de
 * envolverse en un `user_action` genérico con el nombre adentro. Los embudos de
 * PostHog se arman por nombre de evento, y los call sites ya pasan nombres
 * buenos ('direct_blend_deposit_attempted'). No hay historial que migrar porque
 * la implementación anterior no guardaba nada.
 */
export function useAnalytics() {
  const capture = (name: string, properties?: Record<string, AllowedPropertyValues>) => {
    if (!isPostHogEnabled()) return;
    posthog.capture(name, properties);
  };

  const trackEvent = capture;

  const trackUserAction = (action: string, details?: Record<string, AllowedPropertyValues>) =>
    capture(action, details);

  const trackConversion = (conversionType: string, value?: number, currency?: string) =>
    capture(conversionType, {
      ...(typeof value !== 'undefined' ? { value } : {}),
      ...(typeof currency !== 'undefined' ? { currency } : {}),
    });

  // El error va como propiedad y no como nombre: un nombre por mensaje de error
  // llenaría la lista de eventos de basura irrepetible.
  const trackError = (error: string, context?: Record<string, AllowedPropertyValues>) =>
    capture('error', { error, ...(context ?? {}) });

  return {
    trackEvent,
    trackUserAction,
    trackConversion,
    trackError,
  };
}
