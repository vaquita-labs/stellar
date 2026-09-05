/**
 * La parte del pozo de premios que le toca a UN depósito.
 *
 * Es el mismo cálculo que hace el contrato al retirar
 * (`calculate_reward`, contracts/vaquita-pool/src/lib.rs:307-315):
 *
 *     reward = reward_pool * amount / total_deposits
 *
 * Existe porque la UI venía mostrando el pozo ENTERO del plazo debajo de una
 * etiqueta que se leía como "esto es tuyo": con $4 de pozo y $183 depositados,
 * un depósito de $32 cobra $0.70, no $4.
 *
 * `totalDeposits` tiene que INCLUIR `amount`. El contrato no saca al que retira
 * del denominador (lib.rs:273 corre antes del decremento de lib.rs:285), así
 * que para una posición que ya existe se pasa el TVL tal cual; para un depósito
 * que todavía no entró hay que sumarle el monto (`totalDeposits + amount`).
 *
 * Es una ESTIMACIÓN, no una promesa: el contrato lee `total_deposits` en vivo,
 * así que la parte de cada uno se achica cuando entra gente nueva al plazo.
 * Siempre mostrala junto a `portfolio.detail.estimateNote`.
 */
export function estimateRewardShare(rewardPool: number, totalDeposits: number, amount: number): number {
  if (!Number.isFinite(rewardPool) || !Number.isFinite(totalDeposits) || !Number.isFinite(amount)) return 0;
  if (rewardPool <= 0 || totalDeposits <= 0 || amount <= 0) return 0;
  // El tope es el pozo entero: si alguien llama con un denominador que no
  // incluye `amount`, el resultado se pasaría del pozo y se vería absurdo en
  // pantalla. El contrato nunca puede pagar más que `reward_pool`.
  return Math.min(rewardPool, (rewardPool * amount) / totalDeposits);
}
