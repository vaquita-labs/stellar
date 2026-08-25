import Image from 'next/image';

export const metadata = {
  title: 'Not available in your region',
  robots: { index: false, follow: false },
};

/**
 * Shown (via a proxy rewrite, so the URL is preserved) to visitors from a
 * country in BLOCKED_COUNTRIES. Deliberately static and translation-free: it
 * renders before the app shell, config or i18n have loaded.
 */
export default function BlockedPage() {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-background p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-2xl border border-black border-b-2 bg-white p-8 text-center">
        <Image src="/vaquita/vaquita_isotipo.svg" alt="Vaquita" width={96} height={96} className="object-contain" />
        <h1 className="text-2xl font-bold text-black">Not available in your region</h1>
        <p className="text-sm leading-relaxed text-gray-600">
          Vaquita is not available from your location. This restriction applies to everyone connecting from a
          jurisdiction we cannot serve, and it is not a judgement about you or your account.
        </p>
        <p className="text-sm leading-relaxed text-gray-600">
          If you believe this is a mistake, contact us at{' '}
          <a href="mailto:hello@vaquita.fi" className="font-bold text-primary">
            hello@vaquita.fi
          </a>
          .
        </p>
        <p className="text-xs text-gray-500">
          You can still read our{' '}
          <a href="/privacy" className="font-bold text-primary">
            Privacy Policy
          </a>
          ,{' '}
          <a href="/terms" className="font-bold text-primary">
            Terms of Service
          </a>{' '}
          and{' '}
          <a href="/risk" className="font-bold text-primary">
            Risk Disclosure
          </a>
          .
        </p>
      </div>
    </div>
  );
}
