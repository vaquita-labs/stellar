'use client';
import { useEffect, useState } from 'react';

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mediaQuery = window.matchMedia(query);
    setMatches(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

export default function PageOnboarding() {
  const isMobile = useMediaQuery('(max-width: 640px)');
  if (isMobile) {
    return (
      <div
        style={{
          position: 'relative',
          maxHeight: 'calc(70vh + 41px)',
          aspectRatio: '0.6946502057613169',
          margin: '0 auto',
        }}
      >
        <iframe
          src="https://demo.arcade.software/O9a6jqOPv9c9fdKlxjID?embed&embed_mobile=inline&embed_desktop=inline&show_copy_link=true"
          title="Learn how to save with Vaquita mobile"
          frameBorder="0"
          loading="lazy"
          allowFullScreen
          allow="clipboard-write"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            colorScheme: 'light',
            // clipPath: 'polygon(2% 10%, 98% 10%, 98% 100%, 2% 98%)',
          }}
        />
      </div>
    );
  } else {
    return (
      <div
        style={{
          position: 'relative',
          paddingBottom: 'calc(47.85714285714286% + 41px)',
          height: '0',
          width: '100%',
        }}
      >
        <iframe
          src="https://demo.arcade.software/fig4kWFCOkXCO48WunnY?embed&embed_mobile=inline&embed_desktop=inline&show_copy_link=true"
          title="Learn how to save with Vaquita"
          frameBorder="0"
          loading="lazy"
          allowFullScreen
          allow="clipboard-write"
          style={{
            position: 'absolute',
            top: 0,
            // left: '45%',
            // transform: 'translateX(-50%)',
            width: '100%',
            height: '100%',
            colorScheme: 'light',
            borderRadius: '0px',
            // clipPath: 'polygon(21% 20%, 94% 20%, 94% 98%, 21% 98%)',
          }}
        />
      </div>
    );
  }
}
