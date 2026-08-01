import { ReactNode } from 'react';
import { FiAward, FiShield, FiTrendingUp } from 'react-icons/fi';
import { IoRocketOutline } from 'react-icons/io5';

/**
 * Identidad visual de cada allocation. El índice es la posición del plazo en la
 * lista ordenada de menor a mayor, así el color y el ícono cuentan la misma
 * historia que el APY: escudo/azul para el plazo más corto (lo más "a mano") y
 * cohete/dorado para el más largo (lo que más rinde). Se cicla si algún día hay
 * más plazos que estilos.
 */
const STYLES = [
  {
    chip: 'bg-[#DCE9FF] text-[#1B4FCB]',
    solid: 'bg-[#1B4FCB] text-white',
    hex: '#1B4FCB',
    icon: <FiShield className="w-5 h-5" />,
    image: '/icons/global/tier-01-seed.webp',
  },
  {
    chip: 'bg-success/20 text-success',
    solid: 'bg-success text-black',
    hex: '#34C759',
    icon: <FiTrendingUp className="w-5 h-5" />,
    image: '/icons/global/tier-02-sprout.webp',
  },
  {
    chip: 'bg-[#E9DEFB] text-[#45169B]',
    solid: 'bg-[#7C3AED] text-white',
    hex: '#7C3AED',
    icon: <IoRocketOutline className="w-5 h-5" />,
    image: '/icons/global/tier-03-seedling.webp',
  },
  {
    chip: 'bg-[#FADCE4] text-[#B0184B]',
    solid: 'bg-[#E11D63] text-white',
    hex: '#E11D63',
    icon: <FiAward className="w-5 h-5" />,
  },
] as const;

export interface AllocationStyle {
  /** Fondo suave + texto: para chips de APY y el círculo del ícono. */
  chip: string;
  /** Fondo pleno + texto: para las pastillas From/To del move y la barra. */
  solid: string;
  /** Color crudo (hex) del plazo: para el `stroke` del donut, donde no sirve una
   *  clase de Tailwind. Debe coincidir con el color de `solid`. */
  hex: string;
  /** Ícono de respaldo (se usa si no hay `image`, ej. un 4º plazo sin sticker). */
  icon: ReactNode;
  /**
   * Sticker de crecimiento del plazo (semilla → brote → plántula): a más largo el
   * plazo, más crecida la planta, contando la misma historia que el APY. Los
   * plazos sin sticker (más allá del 3º) caen al `icon`.
   */
  image?: string;
}

export const getAllocationStyle = (index: number): AllocationStyle => STYLES[index % STYLES.length];
