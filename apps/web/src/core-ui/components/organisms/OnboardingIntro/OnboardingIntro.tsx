'use client';

import Image from 'next/image';
import { useState } from 'react';
import { Button } from '../../atoms';

interface Slide {
  image: string;
  imageAlt: string;
  title: string;
  description: string;
}

const SLIDES: Slide[] = [
  {
    image: '/vaquita/vaquita_isotipo.svg',
    imageAlt: 'Vaquita',
    title: 'Welcome to Vaquita',
    description:
      'Vaquita is your gamified savings app on Stellar. Save money, take care of your vaquita and watch your world grow.',
  },
  {
    image: '/icons/global/coin.png',
    imageAlt: 'Vaquita coin',
    title: 'Save & earn',
    description:
      'Deposit and generate real yield. The more you save, the more your vaquita thrives and the more coins you collect.',
  },
  {
    image: '/icons/global/trophy.png',
    imageAlt: 'Trophy',
    title: 'Rewards & achievements',
    description:
      'Keep your daily streak alive, unlock achievements and climb the leaderboard while you build a healthy savings habit.',
  },
];

interface OnboardingIntroProps {
  onFinish: () => void;
}

export function OnboardingIntro({ onFinish }: OnboardingIntroProps) {
  const [index, setIndex] = useState(0);

  const isLast = index === SLIDES.length - 1;
  const slide = SLIDES[index];

  const handleNext = () => {
    if (isLast) {
      onFinish();
    } else {
      setIndex((prev) => prev + 1);
    }
  };

  const handleBack = () => {
    setIndex((prev) => Math.max(0, prev - 1));
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-between bg-background px-6 py-10 sm:py-14">
      {/* Skip */}
      <div className="w-full max-w-md flex justify-end">
        <button
          onClick={onFinish}
          className="text-sm font-semibold text-black/50 hover:text-black transition"
        >
          Skip
        </button>
      </div>

      {/* Slide content */}
      <div className="flex-1 w-full max-w-md flex flex-col items-center justify-center text-center gap-6">
        <div className="relative w-56 h-56 sm:w-64 sm:h-64 flex items-center justify-center">
          <Image
            key={slide.image}
            src={slide.image}
            alt={slide.imageAlt}
            fill
            sizes="256px"
            className="object-contain drop-shadow-md animate-[fadeIn_0.35s_ease]"
            priority
          />
        </div>

        <h1 className="text-2xl sm:text-3xl font-bold text-black">{slide.title}</h1>
        <p className="text-base text-black/70 leading-relaxed max-w-sm">{slide.description}</p>
      </div>

      {/* Dots */}
      <div className="flex items-center gap-2 mb-6">
        {SLIDES.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            aria-label={`Go to slide ${i + 1}`}
            className={`h-2.5 rounded-full transition-all ${
              i === index ? 'w-7 bg-primary' : 'w-2.5 bg-black/20 hover:bg-black/30'
            }`}
          />
        ))}
      </div>

      {/* Navigation */}
      <div className="w-full max-w-md flex items-center gap-3">
        {index > 0 ? (
          <Button type="white" onPress={handleBack}>
            Back
          </Button>
        ) : (
          <div className="w-[72px]" />
        )}
        <Button type="primary" wFull onPress={handleNext} className="flex-1">
          {isLast ? "Let's start" : 'Next'}
        </Button>
      </div>
    </div>
  );
}
