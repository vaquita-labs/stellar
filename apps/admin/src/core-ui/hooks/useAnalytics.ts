'use client';

import { track } from '@vercel/analytics';

type AllowedPropertyValues = string | number | boolean | null;

export function useAnalytics() {
  const trackEvent = (name: string, properties?: Record<string, AllowedPropertyValues>) => {
    track(name, properties);
  };

  const trackPageView = (page: string) => {
    track('page_view', { page });
  };

  const trackUserAction = (action: string, details?: Record<string, AllowedPropertyValues>) => {
    track('user_action', { action, ...details });
  };

  const trackConversion = (conversionType: string, value?: number, currency?: string) => {
    const properties: Record<string, AllowedPropertyValues> = { 
      type: conversionType, 
      timestamp: new Date().toISOString()
    };

    if (typeof value !== 'undefined') {
      properties.value = value;
    }
    if (typeof currency !== 'undefined') {
      properties.currency = currency;
    }

    track('conversion', properties);
  };

  const trackError = (error: string, context?: Record<string, AllowedPropertyValues>) => {
    const properties: Record<string, AllowedPropertyValues> = {
      error,
      timestamp: new Date().toISOString(),
      ...(context ? context : {}),
    };
    track('error', properties);
  };

  return {
    trackEvent,
    trackPageView,
    trackUserAction,
    trackConversion,
    trackError,
  };
}
