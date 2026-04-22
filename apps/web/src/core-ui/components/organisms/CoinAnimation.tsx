'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import { useEffect, useState } from 'react';

interface CoinAnimationProps {
  targetPosition: { x: number; y: number } | null;
  onComplete?: () => void;
  coinCount?: number;
}

export const CoinAnimation = ({ targetPosition, onComplete, coinCount = 8 }: CoinAnimationProps) => {
  const [coins, setCoins] = useState<Array<{ id: number; delay: number }>>([]);

  useEffect(() => {
    if (targetPosition) {
      // Crear múltiples monedas con delays ligeramente diferentes para efecto cascada
      const newCoins = Array.from({ length: coinCount }, (_, i) => ({
        id: i,
        delay: i * 0.03, // Delay escalonado de 30ms entre cada moneda
      }));
      setCoins(newCoins);

      // Limpiar después de la animación
      const timer = setTimeout(() => {
        setCoins([]);
        onComplete?.();
      }, 2000); // Duración total de la animación

      return () => clearTimeout(timer);
    }
  }, [targetPosition, coinCount, onComplete]);

  if (!targetPosition || coins.length === 0) return null;

  // Posición inicial: centro de la pantalla
  const startX = typeof window !== 'undefined' ? window.innerWidth / 2 : 0;
  const startY = typeof window !== 'undefined' ? window.innerHeight / 2 : 0;

  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {coins.map((coin) => (
        <motion.div
          key={coin.id}
          className="absolute"
          initial={{
            x: startX - 20, // Centrar la imagen (40px / 2)
            y: startY - 20,
            scale: 0.5,
            opacity: 0,
            rotate: 0,
          }}
          animate={{
            x: targetPosition.x - 20 + (Math.random() - 0.5) * 20, // Pequeña variación aleatoria
            y: targetPosition.y - 20 + (Math.random() - 0.5) * 20,
            scale: [0.5, 1.2, 1], // Efecto de rebote
            opacity: [0, 1, 1, 0.8, 0], // Fade in y fade out
            rotate: [0, 180, 360], // Rotación completa
          }}
          transition={{
            duration: 1.5,
            delay: coin.delay,
            ease: [0.25, 0.1, 0.25, 1], // Easing suave
            opacity: {
              times: [0, 0.1, 0.7, 0.9, 1],
              duration: 1.5,
            },
          }}
          style={{
            willChange: 'transform, opacity',
          }}
        >
          <Image
            src="/icons/summary/silver_coin.png"
            alt="Coin"
            width={40}
            height={40}
            className="object-contain"
            priority
          />
        </motion.div>
      ))}
    </div>
  );
};

