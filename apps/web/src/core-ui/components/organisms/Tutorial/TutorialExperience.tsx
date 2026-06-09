'use client';

import { Button as HeroButton, Spinner } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
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
import { TutorialWaitModal } from './TutorialWaitModal';
import {
  TUTORIAL_ANCHOR_SAVE,
  TUTORIAL_ANCHOR_VAQUITA_CARD,
  TUTORIAL_ANCHOR_WITHDRAW,
  TUTORIAL_DEFAULT_AMOUNT,
  TUTORIAL_LOCK_MS,
  TUTORIAL_STEPS,
  tutorialInterest,
} from './tutorialConfig';

// Selectores estables de los botones del footer de AppModal (HeroUI). Los usa
// el focus lock para resaltar el único botón accionable del paso.
const MODAL_PRIMARY_BTN = '[data-slot="modal-footer"] button';
// Primer botón del footer = Cancel (en la confirmación de retiro).
const MODAL_FIRST_BTN = '[data-slot="modal-footer"] button:first-child';
// Último botón del footer = acción principal (Deposit / Withdraw / Claim).
const MODAL_LAST_BTN = '[data-slot="modal-footer"] button:last-child';

/**
 * Experiencia del tutorial en `/tutorial`. Recrea el home real y guía con los
 * modales REALES (depósito y Bank Rewards/retiro) en modo simulado.
 *
 * Flujo compacto: depósito de {@link TUTORIAL_DEFAULT_AMOUNT} → abrir el banco →
 * tocar la tarjeta → en el detalle se intenta retirar antes de tiempo (aviso
 * "qué pasa si esperás") → la cuenta regresiva de 10s corre DENTRO del propio
 * detalle (contador segundo a segundo) → al llegar a 0 se retira con interés →
 * recibo final → `/home`. No hay pantallas intermedias de espera.
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
  const [detailOpen, setDetailOpen] = useState(false);
  // Estamos en la pantalla "Confirm withdrawal" del detalle.
  const [inConfirm, setInConfirm] = useState(false);
  // Aviso "But if you wait…", tras cancelar y ANTES de arrancar el contador.
  const [showWaitIntro, setShowWaitIntro] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // `depositedAt`: cuándo se hizo el depósito (para "Started at"). `lockStartAt`:
  // cuándo arranca la cuenta regresiva de 10s (al cerrar el aviso de paciencia).
  const [depositedAt, setDepositedAt] = useState<number | null>(null);
  const [lockStartAt, setLockStartAt] = useState<number | null>(null);
  const [now, setNow] = useState(0);

  // Reloj: avanza `now` mientras corre el lock para que el contador del detalle
  // baje de 10 a 0 segundo a segundo. Date.now() acá es código de app normal.
  useEffect(() => {
    if (lockStartAt == null) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [lockStartAt]);

  const step = TUTORIAL_STEPS[index];
  const interest = tutorialInterest(amount);
  const anyModalOpen = depositOpen || bankOpen;
  // El lock llegó a 0: el depósito quedó listo para retirar con interés.
  const lockElapsed = lockStartAt != null && now >= lockStartAt + TUTORIAL_LOCK_MS;

  // Depósito simulado que alimenta el Bank Rewards y el detalle reales. Antes de
  // arrancar el lock el contador está congelado (server == created); al fijar
  // `lockStartAt` el reloj corre y el detalle baja de 10s a 0.
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

  // Abrir el depósito es su propio salto de paso: `deposit` (resalta Save) →
  // `confirm-deposit` (resalta Deposit dentro del modal). Así cada tarjeta del
  // flujo es un punto de progreso de TUTORIAL_STEPS, controlado en un solo lugar.
  const startDeposit = () => {
    if (step.id !== 'deposit') return;
    setDepositOpen(true);
    goNext();
  };

  // Auto-avance del paso `cancel-wait` → `claim` cuando el contador llega a 0.
  useEffect(() => {
    if (step.id === 'cancel-wait' && lockElapsed) goNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, lockElapsed]);

  // Si se cierra el modal de depósito sin confirmar, volvemos a `deposit`. En el
  // éxito el índice ya avanzó a `open-bank` antes de cerrar, así que no aplica.
  useEffect(() => {
    if (step.id === 'confirm-deposit' && !depositOpen) setIndex((i) => Math.max(i - 1, 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.id, depositOpen]);

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

  // Tocar la tarjeta del depósito (en el banco): entra al detalle y, si era el
  // paso `select-deposit`, avanza a `withdraw-early`.
  const handleDetailOpenChange = (open: boolean) => {
    setDetailOpen(open);
    if (open && step.id === 'select-deposit') goNext();
  };

  // Entrar/salir de "Confirm withdrawal":
  // - Entrar en `withdraw-early` → avanza a `cancel-wait` (resalta Cancel).
  // - Salir con Cancel en `cancel-wait` (aún bloqueado) → muestra "But if you
  //   wait…" antes de arrancar el contador.
  const handleConfirmingChange = (isConfirming: boolean) => {
    setInConfirm(isConfirming);
    if (isConfirming) {
      if (step.id === 'withdraw-early') goNext();
      return;
    }
    if (step.id === 'cancel-wait' && lockStartAt == null) setShowWaitIntro(true);
  };

  const onPrimary = () => {
    if (finishing) return;
    switch (step.id) {
      case 'deposit':
        startDeposit();
        break;
      case 'open-bank':
        setBankOpen(true);
        goNext();
        break;
      case 'success':
        void finish();
        break;
      default:
        goNext();
    }
  };

  // En el detalle del depósito el modal queda bloqueado: solo se avanza
  // retirando (no se puede cerrar ni cancelar). La pantalla de confirmación usa
  // otro footer, donde Cancel sí queda habilitado.
  const inBankFlow = step.id === 'withdraw-early' || step.id === 'cancel-wait' || step.id === 'claim';
  const lockToWithdraw = inBankFlow && detailOpen;

  // Resaltes (oscurecer todo menos un elemento + tarjetita guía con dots):
  // - `select-deposit`: la tarjeta del depósito en el banco.
  const focusCard = bankOpen && step.id === 'select-deposit' && !detailOpen;
  // - `withdraw-early`: el botón Withdraw (bloqueado) para intentar retirar.
  const focusWithdrawEarly = bankOpen && step.id === 'withdraw-early' && detailOpen && !inConfirm;
  // - `cancel-wait`: Cancel en la confirmación (antes de que arranque el lock).
  const focusCancel = bankOpen && step.id === 'cancel-wait' && inConfirm && lockStartAt == null;
  // - `claim`: Withdraw del detalle (listo) y luego "Claim now" en la confirmación.
  const focusWithdrawReady = bankOpen && step.id === 'claim' && detailOpen && !inConfirm && lockElapsed;
  const focusClaim = bankOpen && step.id === 'claim' && inConfirm && lockElapsed;

  // Props comunes de los dots de progreso de las tarjetas guía.
  const dots = { dotIndex: index, dotCount: TUTORIAL_STEPS.length };

  return (
    <div className="relative flex h-full w-full flex-col">
      <HeaderStats />

      <div className="relative flex-1">
        {lockPeriod !== null && lockPeriod !== undefined ? (
          <WorldMap walletAddress={walletAddress} worldType={WorldType.FOREST} isAvailable={true} interactionsDisabled />
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
              // Solo abre el depósito en su paso (startDeposit lo verifica); fuera
              // de él un toque accidental no debe dispararlo.
              onPress={startDeposit}
              className="w-full rounded-md border border-b-5 border-[#018222] bg-success py-7 font-bold text-black"
            >
              <span className="text-xl capitalize text-black">{t('tutorial.saveButton', 'Save')}</span>
            </HeroButton>
          </div>
        </div>
      </div>

      {/* Modal de depósito REAL (simulado): lock único de 10s, monto precargado */}
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

      {/* Paso `confirm-deposit`: enfoca SOLO el botón "Deposit" del modal real. */}
      {depositOpen && step.id === 'confirm-deposit' && (
        <TutorialFocusLock
          selector={MODAL_PRIMARY_BTN}
          title={t(step.titleKey, step.params)}
          message={t(step.bodyKey, step.params)}
          {...dots}
        />
      )}

      {/* Bank Rewards REAL con el depósito simulado: tocar la tarjeta → detalle →
          Withdraw → confirmación → aviso → esperar el contador → retirar. Todo el
          retiro (anticipado y final) ocurre INLINE dentro de este modal. */}
      {bankOpen && (
        <BankAPYModal
          open={bankOpen}
          onOpenChange={() => {
            setBankOpen(false);
            setDetailOpen(false);
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
          lockToWithdraw={lockToWithdraw}
        />
      )}

      {/* Aviso "But if you wait…" tras cancelar: al confirmarlo arranca el
          contador de 10s dentro del detalle. */}
      {bankOpen && showWaitIntro && (
        <TutorialWaitModal
          onConfirm={() => {
            setShowWaitIntro(false);
            const startedAt = Date.now();
            setLockStartAt(startedAt);
            setNow(startedAt);
          }}
        />
      )}

      {/* select-deposit: oscurece todo menos la tarjeta del depósito. */}
      {focusCard && (
        <TutorialFocusLock
          selector={`[data-tutorial="${TUTORIAL_ANCHOR_VAQUITA_CARD}"]`}
          title={t(step.titleKey, step.params)}
          message={t(step.bodyKey, step.params)}
          {...dots}
        />
      )}

      {/* withdraw-early: oscurece todo menos Withdraw (intento de retiro). */}
      {focusWithdrawEarly && (
        <TutorialFocusLock
          selector={`[data-tutorial="${TUTORIAL_ANCHOR_WITHDRAW}"]`}
          title={t(step.titleKey, step.params)}
          message={t(step.bodyKey, step.params)}
          {...dots}
        />
      )}

      {/* cancel-wait: oscurece todo menos Cancel en la confirmación. */}
      {focusCancel && (
        <TutorialFocusLock
          selector={MODAL_FIRST_BTN}
          title={t(step.titleKey, step.params)}
          message={t(step.bodyKey, step.params)}
          {...dots}
        />
      )}

      {/* claim: oscurece todo menos Withdraw (listo) y luego "Claim now". */}
      {focusWithdrawReady && (
        <TutorialFocusLock
          selector={`[data-tutorial="${TUTORIAL_ANCHOR_WITHDRAW}"]`}
          title={t(step.titleKey, step.params)}
          message={t(step.bodyKey, step.params)}
          {...dots}
        />
      )}
      {focusClaim && (
        <TutorialFocusLock
          selector={MODAL_LAST_BTN}
          title={t(step.titleKey, step.params)}
          message={t(step.bodyKey, step.params)}
          {...dots}
        />
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
