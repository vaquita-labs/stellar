/**
 * Pasos del tutorial de cada plataforma de "Depositar desde otra app".
 *
 * El catálogo (`config.deposit_platforms`) dice qué apps se ofrecen y cuánto
 * cobran; la prosa vive acá y en los bundles de i18n, porque tiene que existir
 * en tres idiomas y cambia con las pantallas de cada app, no con la config.
 * Cada paso es la key `deposit.otherApp.platforms.<id>.steps.<key>`, con su
 * texto en inglés como fallback.
 *
 * `image` queda para las capturas de cada app cuando existan
 * (`public/deposit-tutorials/<id>/…`). Sin ella el paso se muestra sólo con texto.
 */
export interface TutorialStep {
  key: string;
  fallback: string;
  image?: string;
}

export const TUTORIALS: Record<string, TutorialStep[]> = {
  binance: [
    { key: 'open', fallback: 'Open Binance and go to Assets → Withdraw.' },
    { key: 'coin', fallback: 'Pick USDC as the coin and Stellar (XLM) as the network.' },
    { key: 'address', fallback: 'Paste your Vaquita address. Leave MEMO empty.' },
    { key: 'amount', fallback: 'Enter the amount and confirm the withdrawal.' },
  ],
  meru: [
    { key: 'open', fallback: 'Open Meru and tap Send.' },
    { key: 'coin', fallback: 'Choose USDC on the Stellar network.' },
    { key: 'address', fallback: 'Paste your Vaquita address.' },
    { key: 'amount', fallback: 'Enter the amount and confirm.' },
  ],
};
