/**
 * Pasos del tutorial de cada plataforma de "Depositar desde otra app".
 *
 * El catálogo (`config.deposit_platforms`) dice qué apps se ofrecen y cuánto
 * cobran; la prosa vive acá y en los bundles de i18n, porque tiene que existir
 * en tres idiomas y cambia con las pantallas de cada app, no con la config.
 * Cada paso es `deposit.otherApp.platforms.<id>.steps.<key>.{title,body}`, con
 * su texto en inglés como fallback.
 *
 * Cada paso lleva una imagen: una captura real (`image`) o, si la app no publicó
 * ninguna, un dibujo de la pantalla hecho con filas (`illustration`, ver
 * `StepIllustration`). Para pasar un paso a captura basta con dejar el archivo
 * en `public/deposit-tutorials/<id>/` y poner `image`.
 *
 * Las capturas de Binance salen de su guía oficial "How to withdraw crypto from
 * Binance" (https://www.binance.com/en/support/faq/how-to-withdraw-crypto-from-binance-115003670492),
 * recortadas y pasadas a webp de 480 px. Originales, en orden:
 *   step-1  public.bnbstatic.com/image/cms/content/body/202608/6566104ee45aa8edfa6de11647163e23.png
 *   step-2  public.bnbstatic.com/image/cms/content/body/202608/c58a8b4f092e8685928bec97b6117e97.png
 *   step-3  public.bnbstatic.com/image/cms/content/body/202608/11b65b6c6038430f5ec60e3579ce5caf.png
 *   step-4  public.bnbstatic.com/image/cms/content/body/202608/c71324b2a0ab2abeb8d65bd81868fd19.jpeg
 *   step-5  public.bnbstatic.com/image/cms/content/body/202609/dbe9b24fda29144dc45042a2b55b0ee6.png
 *   step-6  public.bnbstatic.com/image/cms/content/body/202608/43cafb48189afea0981897ac551ed396.png
 * Meru no tiene capturas públicas de sus pantallas; por eso va dibujado.
 */

/** Texto fijo (nombres propios: USDC, Stellar) o una key de i18n con su fallback. */
export type Copy = string | { key: string; fallback: string };

export type IllustrationChip = 'pick' | 'paste' | 'blank' | 'tap' | 'check';

export interface IllustrationRow {
  label: Copy;
  /** Texto gris al lado del label (p. ej. "USD Coin"). */
  sub?: Copy;
  /** Valor alineado a la derecha (montos de la pantalla de revisión). */
  value?: string;
  /** Muestra la dirección del usuario, acortada, debajo del label. */
  address?: boolean;
  /** Campo vacío ("—") debajo del label. */
  empty?: boolean;
  highlight?: boolean;
  /** Opción que no hay que elegir: se ve apagada. */
  off?: boolean;
  chip?: IllustrationChip;
}

export interface Illustration {
  /** Pantalla de la app ("Inicio", "Red"...). Se muestra como "<App> · <pantalla>". */
  screen: Copy;
  /** Fila de botones arriba (el menú principal de la app). */
  buttons?: { label: Copy; highlight?: boolean }[];
  rows?: IllustrationRow[];
}

export interface TutorialStep {
  key: string;
  title: string;
  body?: string;
  image?: string;
  illustration?: Illustration;
}

const il = (key: string, fallback: string): Copy => ({ key: `deposit.otherApp.illustration.${key}`, fallback });

export const TUTORIALS: Record<string, TutorialStep[]> = {
  binance: [
    {
      key: 'open',
      title: 'Open Binance and tap Send',
      body: 'Go to Assets at the bottom, then Overview → Send.',
      image: '/deposit-tutorials/binance/step-1.webp',
    },
    {
      key: 'method',
      title: 'Choose Withdraw Asset',
      body: 'It sends crypto from Binance to another wallet, like your Vaquita account.',
      image: '/deposit-tutorials/binance/step-2.webp',
    },
    {
      key: 'coin',
      title: 'Pick USDC',
      body: 'Search for USDC. Not USDT: Binance can’t send USDT on Stellar.',
      image: '/deposit-tutorials/binance/step-3.webp',
    },
    {
      key: 'address',
      title: 'Set the network to Stellar (XLM) and paste your address',
      body: 'In Select Network pick Stellar (XLM); any other network loses the money. Paste the address you’ll copy on the next screen (it starts with G) and leave MEMO empty.',
      image: '/deposit-tutorials/binance/step-4.webp',
    },
    {
      key: 'amount',
      title: 'Enter the amount',
      body: 'Binance keeps 1 USDC as its fee, so send at least 2 USDC.',
      image: '/deposit-tutorials/binance/step-5.webp',
    },
    {
      key: 'confirm',
      title: 'Check and confirm',
      body: 'Make sure the network says Stellar, then slide to confirm and enter your security code.',
      image: '/deposit-tutorials/binance/step-6.webp',
    },
  ],
  meru: [
    {
      key: 'open',
      title: 'Tap Send',
      body: 'On Meru’s home screen, tap Send and pick “To a crypto wallet”.',
      illustration: {
        screen: il('screens.home', 'Home'),
        buttons: [{ label: il('add', 'Add') }, { label: il('send', 'Send'), highlight: true }, { label: il('card', 'Card') }],
        rows: [
          { label: il('toCryptoWallet', 'To a crypto wallet'), highlight: true, chip: 'tap' },
          { label: il('toBank', 'To a bank account'), off: true },
        ],
      },
    },
    {
      key: 'coin',
      title: 'Choose USDC',
      body: 'Your Meru dollars go out as USDC.',
      illustration: {
        screen: il('screens.asset', 'Asset'),
        rows: [{ label: 'USDC', sub: 'USD Coin', highlight: true, chip: 'pick' }],
      },
    },
    {
      key: 'network',
      title: 'Pick the Stellar network',
      body: 'Any other network sends the money somewhere Vaquita can’t see.',
      illustration: {
        screen: il('screens.network', 'Network'),
        rows: [
          { label: 'Stellar', sub: 'XLM', highlight: true, chip: 'check' },
          { label: 'Polygon', off: true },
          { label: 'Ethereum', off: true },
        ],
      },
    },
    {
      key: 'address',
      title: 'Paste your Vaquita address',
      body: 'The one you’ll copy on the next screen. It starts with G.',
      illustration: {
        screen: il('screens.recipient', 'Recipient'),
        rows: [{ label: il('walletAddress', 'Wallet address'), address: true, highlight: true, chip: 'paste' }],
      },
    },
    {
      key: 'memo',
      title: 'Leave Memo empty',
      body: 'Vaquita doesn’t use a memo.',
      illustration: {
        screen: il('screens.recipient', 'Recipient'),
        rows: [{ label: il('memo', 'Memo (optional)'), empty: true, highlight: true, chip: 'blank' }],
      },
    },
    {
      key: 'amount',
      title: 'Enter the amount and confirm',
      body: 'Meru shows its fee before you confirm: 1% plus 1 USD.',
      illustration: {
        screen: il('screens.review', 'Review'),
        rows: [
          { label: il('youSend', 'You send'), value: '50.00 USD' },
          { label: il('fee', 'Fee'), value: '1.50 USD' },
          { label: il('theyReceive', 'They receive'), value: '48.50 USDC', highlight: true },
        ],
      },
    },
  ],
};
