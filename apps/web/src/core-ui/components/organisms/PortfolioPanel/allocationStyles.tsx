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
  { chip: 'bg-[#DCE9FF] text-[#1B4FCB]', solid: 'bg-[#1B4FCB] text-white', icon: <FiShield className="w-5 h-5" /> },
  { chip: 'bg-success/20 text-success', solid: 'bg-success text-black', icon: <FiTrendingUp className="w-5 h-5" /> },
  { chip: 'bg-[#F5E3C0] text-[#8A5B00]', solid: 'bg-[#B97204] text-white', icon: <IoRocketOutline className="w-5 h-5" /> },
  { chip: 'bg-[#E9DEFB] text-[#45169B]', solid: 'bg-[#45169B] text-white', icon: <FiAward className="w-5 h-5" /> },
] as const;

export interface AllocationStyle {
  /** Fondo suave + texto: para chips de APY y el círculo del ícono. */
  chip: string;
  /** Fondo pleno + texto: para las pastillas From/To del move. */
  solid: string;
  icon: ReactNode;
}

export const getAllocationStyle = (index: number): AllocationStyle => STYLES[index % STYLES.length];
