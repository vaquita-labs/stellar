import { useEffect, useState } from 'react';
import { Font, FontLoader } from 'three/examples/jsm/loaders/FontLoader.js';

export const useFont = () => {
  const [font, setFont] = useState<Font | null>(null);
  useEffect(() => {
    const loader = new FontLoader();
    loader.load(
      '/font/helvetiker_bold.typeface.json',
      (loadedFont) => {
        setFont(loadedFont);
      },
      undefined,
      (error) => {
        console.error('Error loading font:', error);
      }
    );
  }, []);

  return font;
};
