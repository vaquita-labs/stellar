'use client';

import { Button as HeroButton, Spinner } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { TutorialFocusLock } from './TutorialFocusLock';
import { TutorialOverlay } from './TutorialOverlay';
import { TutorialPatienceModal } from './TutorialPatienceModal';
import {
  TUTORIAL_ANCHOR_SAVE,
  TUTORIAL_ANCHOR_VAQUITA_CARD,
  TUTORIAL_ANCHOR_WITHDRAW,
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
  const { t } = useTranslation();
  const { walletAddress, lockPeriod, network, token } = useConfigStore();
  const { saveProfileFlags } = useRestProfile();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [index, setIndex] = useState(0);
  const [amount, setAmount] = useState(TUTORIAL_DEFAULT_AMOUNT);
  const [depositOpen, setDepositOpen] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  // El detalle de la vaquita ahora vive INLINE dentro del Bank Rewards (sin un
  // segundo modal). Esto solo refleja si ese detalle está abierto, para ocultar
  // el anillo guía y avanzar el paso al volver a la lista.
  const [detailOpen, setDetailOpen] = useState(false);
  // Aviso "Patience pays off" mostrado SOBRE la pantalla de confirmación de
  // retiro anticipado (cuando el usuario intenta retirar antes de tiempo).
  const [showPatience, setShowPatience] = useState(false);
  // Una vez visto el aviso, dejamos de forzar el toque en Withdraw para que el
  // usuario pueda cancelar y seguir esperando el timer.
  const [patienceAcked, setPatienceAcked] = useState(false);
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
  const anyModalOpen = depositOpen || bankOpen;

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
  // SUCCESS fuera de lock → useVaquitaMood lo lee como 'excited'.
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

  // Cierra el banco y avanza a "But if you wait…". Tras ver el aviso de
  // paciencia, CUALQUIER salida del detalle/confirmación (X, atrás o Cancel)
  // debe avanzar el tutorial. Como esas salidas pueden disparar más de un
  // callback a la vez, el ref evita un doble goNext (que saltaría un paso).
  const findAdvancedRef = useRef(false);
  const exitFindDepositToNext = () => {
    if (step.id !== 'find-deposit' || findAdvancedRef.current) return;
    findAdvancedRef.current = true;
    setShowPatience(false);
    setPatienceAcked(false);
    setDetailOpen(false);
    setBankOpen(false);
    goNext();
  };

  // El detalle inline del Bank Rewards se abrió/cerró. Tras ver el aviso, volver
  // a la lista (atrás / Cancel del detalle) avanza el tutorial.
  const handleDetailOpenChange = (inDetail: boolean) => {
    setDetailOpen(inDetail);
    if (!inDetail && patienceAcked) exitFindDepositToNext();
  };

  // Cuando el usuario llega a "Confirm withdrawal" intentando retirar antes de
  // tiempo (paso find-deposit, depósito aún bloqueado) mostramos el aviso de
  // paciencia encima. En 'ready' el retiro es a tiempo, así que no aplica. Si
  // sale de la confirmación (Cancel) ya habiendo visto el aviso, avanzamos.
  const handleConfirmingChange = (isConfirming: boolean) => {
    if (isConfirming) {
      setShowPatience(step.id === 'find-deposit');
      return;
    }
    setShowPatience(false);
    if (patienceAcked) exitFindDepositToNext();
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
        findAdvancedRef.current = false;
        setBankOpen(true);
        break;
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
              <span className="text-xl capitalize text-black">{t('tutorial.saveButton', 'Save')}</span>
            </HeroButton>
          </div>
        </div>
      </div>

      {/* Cronómetro flotante (arriba a la derecha) durante la espera */}
      {step.id === 'waiting' && (
        <div className="pointer-events-none fixed right-3 top-40 z-50 flex items-center gap-1.5 rounded-full border border-black bg-white px-2.5 py-1 shadow-md md:top-28">
          {secondsLeft > 0 ? (
            <>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-black/50">
                {t('tutorial.timer.unlocks', 'Unlocks')}
              </span>
              <span className="text-sm font-bold tabular-nums text-black">{secondsLeft}s</span>
            </>
          ) : (
            <span className="text-sm font-bold text-black">{t('tutorial.timer.ready', 'Ready! 🎉')}</span>
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

      {/* En el paso de depósito enfocamos SOLO el botón "Deposit": el resto del
          modal queda difuminado y no clicleable, y el botón parpadea. Reutiliza
          el selector estable del footer de AppModal (HeroUI). */}
      {depositOpen && step.id === 'deposit' && (
        <TutorialFocusLock selector='[data-slot="modal-footer"] button' />
      )}

      {/* Bank Rewards REAL con el depósito simulado inyectado. El detalle/retiro
          se pinta INLINE dentro de este mismo modal (sin un segundo modal). */}
      {bankOpen && (
        <BankAPYModal
          open={bankOpen}
          onOpenChange={() => {
            // Tras ver el aviso, cerrar el banco con la X también avanza.
            if (step.id === 'find-deposit' && patienceAcked) {
              exitFindDepositToNext();
              return;
            }
            setBankOpen(false);
            setDetailOpen(false);
            setShowPatience(false);
            setPatienceAcked(false);
          }}
          injectedDeposits={[simulatedDeposit]}
          simulate
          simulateInterest={interest}
          onSimulatedWithdraw={() => {
            setDetailOpen(false);
            setBankOpen(false);
            goNext();
          }}
          onDetailOpenChange={handleDetailOpenChange}
          onConfirmingChange={handleConfirmingChange}
          lockToWithdraw={step.id === 'find-deposit' && detailOpen && !patienceAcked}
        />
      )}

      {/* Aviso "Patience pays off" SOBRE la confirmación de retiro anticipado */}
      {bankOpen && showPatience && (
        <TutorialPatienceModal
          amount={amount}
          interest={interest}
          onAck={() => {
            setShowPatience(false);
            setPatienceAcked(true);
          }}
        />
      )}

      {/* Guía (sin texto): oscurece todo el modal menos la tarjeta del depósito,
          que queda nítida, clicleable y con borde parpadeante para tocarla. */}
      {bankOpen && !detailOpen && <TutorialFocusLock selector={`[data-tutorial="${TUTORIAL_ANCHOR_VAQUITA_CARD}"]`} />}

      {/* En find-deposit forzamos el toque en Withdraw (para llegar al aviso de
          paciencia): oscurecemos todo el detalle menos ese botón. Tras verlo
          dejamos de insistir para que pueda cancelar. */}
      {bankOpen && detailOpen && step.id === 'find-deposit' && !showPatience && !patienceAcked && (
        <TutorialFocusLock selector={`[data-tutorial="${TUTORIAL_ANCHOR_WITHDRAW}"]`} />
      )}

      {/* Capa de coachmarks (oculta mientras hay un modal abierto) */}
      {!anyModalOpen && (
        <TutorialOverlay
          step={step}
          index={index}
          amount={amount}
          interest={interest}
          primaryLabel={t(step.ctaKey, step.params)}
          primaryDisabled={finishing}
          primaryLoading={finishing}
          onPrimary={onPrimary}
          onSkip={finish}
        />
      )}
    </div>
  );
}
