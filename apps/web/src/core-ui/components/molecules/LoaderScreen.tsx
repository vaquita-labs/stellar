'use client';

import Image from 'next/image';
import { PropsWithChildren, useEffect, useState } from 'react';

const frames = [
  '/vaquita-loading/loading1.svg',
  '/vaquita-loading/loading2.svg',
  '/vaquita-loading/loading3.svg',
  '/vaquita-loading/loading4.svg',
];

const indexRef = {
  current: 0,
};

export const LoaderScreen = ({ children, withImage = false }: PropsWithChildren<{ withImage?: boolean }>) => {
  const [index, setIndex] = useState(indexRef.current);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (withImage) {
      const nextImage = () => {
        indexRef.current = (indexRef.current + 1) % frames.length;
        setIndex(indexRef.current);
      };
      nextImage();
      interval = setInterval(nextImage, 150);
    }
    return () => clearInterval(interval);
  }, [withImage]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      aria-modal="true"
      role="dialog"
      aria-labelledby="login-title"
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" />
      <div
        className="relative mx-4 w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-black/5
                   animate-in fade-in zoom-in-95 duration-150 flex flex-col items-center justify-center"
      >
        {withImage && <Image src={frames[index]} alt="logo" width={350} height={350} />}
        {children}
      </div>
    </div>
  );
};
