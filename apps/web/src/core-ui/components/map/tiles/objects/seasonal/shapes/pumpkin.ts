import { BoxSpec, TOON } from '../../kit';

const PUMPKIN_OUTLINE = 0.02;
// Rubor coral de los cachetes de la carita de jack-o (solo bosque).
const PUMPKIN_CHEEK = '#F0603C';

/**
 * Calabaza toon ACHATADA y con GAJOS, estilo jack-o. La versión vieja (núcleo
 * alto) se leía como un cubo redondeado: la clave es que sea más ancha que alta
 * y tenga costillas. Se compone de un núcleo achatado + cuatro gajos cardinales
 * (±X, ±Z) + cuatro gajos diagonales, todos con la base en la superficie
 * (recipe-local y = −0.5). Los gajos sobresalen radialmente y las ranuras entre
 * ellos —rellenas por el inverted-hull negro— dibujan las costillas desde
 * cualquier rotación (incluida la vista cenital). Tallo verde en el tope y —en
 * bosque— una carita de jack-o (ojos cuadrados + cachetes rosados + sonrisa
 * compacta) tallada sobre el gajo +Z. Diseño validado renderizándolo con el
 * pipeline toon real (gradient map + faceShade + inverted-hull de recipe.ts)
 * desde el ángulo iso del juego, de día y de noche, de frente y de espaldas.
 */
export const pumpkin = (body: string, dark: string, stem: string, withEyes: boolean): BoxSpec[] => {
  const CORE_H = 0.56;
  const LOBE_H = 0.5;
  // Un lóbulo: caja redondeada toon con la base en la superficie (bottom = −0.5).
  const lobe = (w: number, h: number, d: number, dx: number, dz: number, bevel = 0.15): BoxSpec => ({
    ...TOON,
    size: [w, h, d],
    at: [dx, -0.5 + h / 2, dz],
    color: body,
    bevel,
    outline: PUMPKIN_OUTLINE,
  });
  const specs: BoxSpec[] = [
    // Núcleo achatado (más ancho que alto) con bisel grande: la panza redonda.
    lobe(0.52, CORE_H, 0.52, 0, 0, 0.22),
    // Gajos cardinales: bulto radial, ancho tangencial moderado (deja la ranura
    // que dibuja la costilla contra los gajos diagonales).
    lobe(0.3, LOBE_H, 0.44, 0.31, 0),
    lobe(0.3, LOBE_H, 0.44, -0.31, 0),
    lobe(0.44, LOBE_H, 0.3, 0, 0.31),
    lobe(0.44, LOBE_H, 0.3, 0, -0.31),
    // Tallo verde embutido en el tope del núcleo.
    { ...TOON, size: [0.13, 0.18, 0.13], at: [0, -0.5 + CORE_H + 0.06, 0], color: stem, bevel: 0.04, outline: PUMPKIN_OUTLINE },
  ];
  // Gajos diagonales: rellenan las esquinas para que la planta sea redonda (no
  // una cruz) y aporten costillas en las diagonales.
  for (const sx of [1, -1]) for (const sz of [1, -1]) specs.push(lobe(0.34, LOBE_H * 0.9, 0.34, 0.27 * sx, 0.27 * sz));

  if (withEyes) {
    // Cara tallada sobre el gajo +Z (cara plana en z = 0.31 + 0.3/2 = 0.46).
    // Parches que sobresalen apenas (front ≈ 0.479). En la panza (no muy arriba,
    // así el bisel del gajo no los proyecta sobre la silueta desde atrás).
    const z = 0.469;
    // Ojos y boca: negros planos (basic, sin luz → negro tallado a cualquier hora).
    const flat = (w: number, h: number, x: number, y: number): BoxSpec => ({
      size: [w, h, 0.02],
      at: [x, y, z],
      color: dark,
      material: 'basic',
      castShadow: false,
      receiveShadow: false,
    });
    // Cachetes: toon (se oscurecen con la escena; con basic brillarían de noche).
    const cheek = (x: number): BoxSpec => ({ ...TOON, size: [0.09, 0.055, 0.02], at: [x, -0.25, z], color: PUMPKIN_CHEEK });
    specs.push(
      flat(0.1, 0.11, -0.12, -0.14), // ojo izq
      flat(0.1, 0.11, 0.12, -0.14), // ojo der
      cheek(-0.17),
      cheek(0.17),
      // Boca compacta (sonrisa): esquinas arriba, centro abajo.
      flat(0.05, 0.05, -0.06, -0.28),
      flat(0.05, 0.045, 0, -0.305),
      flat(0.05, 0.05, 0.06, -0.28)
    );
  }
  return specs;
};
