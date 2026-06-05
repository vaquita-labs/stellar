'use client';

import { Button as HeroButton, Spinner } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useRestProfile } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import {
  DepositResponseDTO,
  DepositStatus,
  DepositWithdrawalState,
  ProfileResponseDTO,
  WorldType,
} from '../../../types';
import { HeaderStats } from '../../home/HeaderStats';
import { WorldMap } from '../../templates';
import { BankAPYModal } from '../BankAPYModal';
import { DepositModal } from '../DepositModal';
import { VaquitaModalContent } from '../VaquitaModal';
import { TutorialOverlay } from './TutorialOverlay';
import { TutorialRing } from './TutorialRing';
import {
  TUTORIAL_ANCHOR_SAVE,
  TUTORIAL_ANCHOR_VAQUITA_CARD,
  TUTORIAL_DEFAULT_AMOUNT,
  TUTORIAL_LOCK_MS,
  TUTORIAL_STEPS,
  tutorialInterest,
} from './tutorialConfig';

const LOCK_SECONDS = Math.round(TUTORIAL_LOCK_MS / 1000);

/**
 * Experiencia del tutorial en `/tutorial`. Recrea el home real y guía paso a
 * paso usando los modales REALES (depósito, Bank Rewards, retiro) en modo
 * simulado, más un cronómetro flotante y la vaquita feliz al cumplir el objetivo.
 * Al terminar persiste `tutorialCompleted` y manda al home.
 */
export function TutorialExperience() {
  const { walletAddress, lockPeriod, network, token } = useConfigStore();
  const { saveProfileFlags } = useRestProfile();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [index, setIndex] = useState(0);
  const [amount, setAmount] = useState(TUTORIAL_DEFAULT_AMOUNT);
  const [depositOpen, setDepositOpen] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  // Momento en que el lock llegó a 0: mostramos la vaquita feliz en el mapa
  // unos segundos antes de pasar a la pantalla "Time's up".
  const [celebrating, setCelebrating] = useState(false);

  // `depositedAt`: cuándo se hizo el depósito (para "Started at"). `lockStartAt`:
  // cuándo arranca la cuenta regresiva de 10s (al cerrar el primer vistazo).
  const [depositedAt, setDepositedAt] = useState<number | null>(null);
  const [lockStartAt, setLockStartAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  // Reloj: avanza `now` mientras corre el lock para que el contador del modal y
  // el HUD bajen de 10 a 0. Date.now() acá es código de app normal.
  useEffect(() => {
    if (lockStartAt == null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [lockStartAt]);

  const step = TUTORIAL_STEPS[index];
  const interest = tutorialInterest(amount);
  const anyModalOpen = depositOpen || bankOpen || withdrawOpen;

  const secondsLeft =
    lockStartAt == null ? LOCK_SECONDS : Math.max(0, Math.ceil((lockStartAt + TUTORIAL_LOCK_MS - now) / 1000));

  // Depósito simulado que alimenta el Bank Rewards y el modal de retiro reales.
  const simulatedDeposit = useMemo<DepositResponseDTO>(() => {
    const created = lockStartAt ?? depositedAt ?? 0;
    const server = lockStartAt == null ? created : now;
    return {
      id: 0,
      state: DepositWithdrawalState.DEPOSIT_SUCCESS,
      amount,
      tokenSymbol: token?.symbol ?? '',
      inLockPeriod: lockStartAt == null ? true : now < created + TUTORIAL_LOCK_MS,
      lockPeriod: TUTORIAL_LOCK_MS,
      vaquitaContractAddress: token?.vaquitaContractAddress ?? '',
      status: DepositStatus.CONFIRMED,
      walletAddress,
      withdrawals: [],
      transactionHash: '',
      depositIdHex: '',
      vaquitaInterest: interest,
      protocolInterest: 0,
      blendInterest: 0,
      createdTimestamp: created,
      updatedTimestamp: created,
      serverTimestamp: server,
      confirmedTimestamp: created,
    };
  }, [amount, depositedAt, lockStartAt, now, interest, token?.symbol, token?.vaquitaContractAddress, walletAddress]);

  const goNext = () => setIndex((i) => Math.min(i + 1, TUTORIAL_STEPS.length - 1));

  // Hace feliz a la vaquita del mapa real: sembramos useDeposits con un depósito
  // SUCCESS fuera de lock → useVaquitaMood lo lee como 'celebrating'.
  const seedHappyVaquita = () => {
    queryClient.setQueryData(['deposit', 'network', network?.networkName, 'wallet', walletAddress], {
      deposits: [
        {
          id: 0,
          state: DepositWithdrawalState.DEPOSIT_SUCCESS,
          amount,
          tokenSymbol: token?.symbol ?? '',
          inLockPeriod: false,
          lockPeriod: TUTORIAL_LOCK_MS,
          vaquitaContractAddress: token?.vaquitaContractAddress ?? '',
        },
      ],
    });
  };

  // Lock a 0 durante la espera: hacemos feliz a la vaquita y marcamos celebración
  // (el mapa sigue visible para verla) antes de pasar a "Time's up".
  useEffect(() => {
    if (step.id === 'waiting' && lockStartAt != null && now >= lockStartAt + TUTORIAL_LOCK_MS && !celebrating) {
      setCelebrating(true);
      seedHappyVaquita();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, now, lockStartAt, celebrating]);

  // Tras unos segundos viendo a la vaquita feliz, mostramos "Time's up".
  useEffect(() => {
    if (!celebrating) return;
    const t = window.setTimeout(() => goNext(), 2200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrating]);

  const finish = async () => {
    setFinishing(true);
    await saveProfileFlags({ tutorialCompleted: true });
    queryClient.setQueryData<ProfileResponseDTO>(
      ['profile', network?.networkName, walletAddress, 'profile-data'],
      (old) => (old ? { ...old, tutorialCompleted: true } : old),
    );
    queryClient.invalidateQueries({ queryKey: ['profile'] });
    // Limpiamos el depósito simulado sembrado para que el home muestre lo real.
    queryClient.invalidateQueries({ queryKey: ['deposit'] });
    router.replace('/home');
  };

  // Cierre del modal de retiro. En el primer vistazo (find-deposit) cerramos
  // todo y vamos a la pantalla "But if you wait…" (el cronómetro arranca ahí).
  const handleWithdrawClose = () => {
    setWithdrawOpen(false);
    if (step.id === 'find-deposit') {
      setBankOpen(false);
      goNext();
    }
  };

  const onPrimary = () => {
    if (finishing) return;
    switch (step.id) {
      case 'deposit':
        setDepositOpen(true);
        break;
      case 'wait-intro': {
        // Arranca el cronómetro y entra a la espera (mapa visible).
        const t = Date.now();
        setLockStartAt(t);
        setNow(t);
        goNext();
        break;
      }
      case 'find-deposit':
      case 'ready':
        setBankOpen(true);
        break;
      case 'success':
        void finish();
        break;
      default:
        goNext();
    }
  };

  return (
    <div className="relative flex h-full w-full flex-col">
      <HeaderStats />

      <div className="relative flex-1">
        {lockPeriod !== null && lockPeriod !== undefined ? (
          <WorldMap
            walletAddress={walletAddress}
            worldType={WorldType.FOREST}
            isAvailable={true}
            interactionsDisabled
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <Spinner />
          </div>
        )}

        {/* Botón Save recreado (mismo look que el home) que el overlay resalta. */}
        <div className="absolute bottom-20 left-0 flex w-full flex-col items-center justify-center gap-1 md:bottom-10">
          <div data-tutorial={TUTORIAL_ANCHOR_SAVE} className="w-full max-w-xl px-2">
            <HeroButton
              size="lg"
              // Solo abre el depósito en su paso; en la espera el mapa es
              // interactivo y no queremos que un toque accidental lo dispare.
              onPress={() => {
                if (step.id === 'deposit') setDepositOpen(true);
              }}
              className="w-full rounded-md border border-b-5 border-[#018222] bg-success py-7 font-bold text-black"
            >
              <span className="text-xl capitalize text-black">Save</span>
            </HeroButton>
          </div>
        </div>
      </div>

      {/* Cronómetro flotante (arriba a la derecha) durante la espera */}
      {step.id === 'waiting' && (
        <div className="pointer-events-none fixed right-3 top-40 z-50 flex items-center gap-1.5 rounded-full border border-black bg-white px-2.5 py-1 shadow-md md:top-28">
          {secondsLeft > 0 ? (
            <>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-black/50">Unlocks</span>
              <span className="text-sm font-bold tabular-nums text-black">{secondsLeft}s</span>
            </>
          ) : (
            <span className="text-sm font-bold text-black">Ready! 🎉</span>
          )}
        </div>
      )}

      {/* Modal de depósito REAL (simulado): lock único de 10s, monto libre */}
      <DepositModal
        open={depositOpen}
        onOpenChange={() => setDepositOpen(false)}
        isDepositing={isDepositing}
        setIsDepositing={setIsDepositing}
        simulate
        initialAmount={TUTORIAL_DEFAULT_AMOUNT.toString()}
        simulateLockMs={TUTORIAL_LOCK_MS}
        onSimulatedSuccess={(depositedAmount) => {
          setAmount(depositedAmount);
          setDepositedAt(Date.now());
          setDepositOpen(false);
          goNext();
        }}
      />

      {/* Bank Rewards REAL con el depósito simulado inyectado */}
      {bankOpen && (
        <BankAPYModal
          open={bankOpen}
          onOpenChange={() => setBankOpen(false)}
          injectedDeposits={[simulatedDeposit]}
          onVaquitaSelect={() => setWithdrawOpen(true)}
        />
      )}

      {/* Guía (sin texto): resalta el depósito para tocarlo dentro del modal */}
      {bankOpen && !withdrawOpen && <TutorialRing selector={`[data-tutorial="${TUTORIAL_ANCHOR_VAQUITA_CARD}"]`} />}

      {/* Modal de retiro REAL (simulado) con el depósito recién hecho */}
      {withdrawOpen && (
        <VaquitaModalContent
          isOpen={withdrawOpen}
          onClose={handleWithdrawClose}
          vaquita={simulatedDeposit}
          simulate
          simulateInterest={interest}
          onSimulatedWithdraw={() => {
            setWithdrawOpen(false);
            setBankOpen(false);
            goNext();
          }}
        />
      )}

      {/* Capa de coachmarks (oculta mientras hay un modal abierto) */}
      {!anyModalOpen && (
        <TutorialOverlay
          step={step}
          index={index}
          amount={amount}
          interest={interest}
          primaryLabel={step.cta}
          primaryDisabled={finishing}
          primaryLoading={finishing}
          onPrimary={onPrimary}
          onSkip={finish}
        />
      )}
    </div>
  );
}
