'use client';

import { toast } from '@heroui/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronUp, FiPlus } from 'react-icons/fi';
import {
  FeedbackBoardEntry,
  FeedbackSort,
  feedbackAttachmentUrl,
  useFeedbackBoard,
  useToggleFeedbackVote,
} from '../../../hooks/useFeedbackBoard';
import { FeedbackKind } from '../../../hooks/useSubmitFeedback';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';

interface FeedbackBoardSheetProps {
  open: boolean;
  onOpenChange: () => void;
  /** Pestaña con la que abre. Adentro se puede cambiar. */
  initialKind?: FeedbackKind;
  /** Abre el formulario para mandar uno nuevo del tipo que se esté mirando. */
  onCreate: (kind: FeedbackKind) => void;
}

/** Estados que se muestran como chip. `open` no lleva: es el default, y ponerle
 *  un chip a cada tarjeta solo agrega ruido. */
const STATUS_STYLES: Record<string, string> = {
  planned: 'bg-[#E7F0FF] text-[#1F4FA8]',
  in_progress: 'bg-[#FFF3D6] text-[#8A5A00]',
  done: 'bg-[#E4F7E8] text-[#1F7A34]',
};

const TAB_CLASSES = (active: boolean) =>
  `flex-1 rounded-full px-3 py-1.5 text-xs font-bold transition ${active ? 'bg-black text-white' : 'bg-black/5 text-black/60'}`;

/**
 * El board público de reportes: lo que otros ya mandaron, con un botón para
 * apoyarlo.
 *
 * Existe para que el segundo, el tercero y el décimo que se topan con el mismo
 * bug lo voten en vez de escribirlo de nuevo: un contador es una señal de
 * prioridad que diez reportes duplicados no dan.
 *
 * Bugs e ideas se miran por separado porque se priorizan distinto —un bug votado
 * es urgencia, una idea votada es demanda—, pero es la misma pantalla: son la
 * misma lista con el mismo gesto.
 */
export function FeedbackBoardSheet({ open, onOpenChange, initialKind = 'bug', onCreate }: FeedbackBoardSheetProps) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<FeedbackKind>(initialKind);
  const [sort, setSort] = useState<FeedbackSort>('top');

  // `initialKind` solo se lee al montar, y alcanza: el sheet se monta únicamente
  // mientras está abierto (ver `ConciergePage`), así que cada apertura arranca
  // en la pestaña que se pidió y las que se elijan adentro duran lo que dure.

  const { data: entries, isLoading, isError } = useFeedbackBoard(kind, sort, open);
  const vote = useToggleFeedbackVote(kind);

  const handleVote = async (entry: FeedbackBoardEntry) => {
    try {
      await vote.mutateAsync(entry.id);
    } catch (e) {
      toast.danger(t('board.voteError', 'Could not register your vote'), {
        description: (e as Error)?.message,
      });
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('board.title', 'Board')}
      size="md"
      bodyClassName="flex flex-col gap-3 pb-2"
      footer={
        <PressableButton variant="primary" size="cta" className="w-full py-2.5!" onClick={() => onCreate(kind)}>
          <FiPlus className="mr-1 inline h-4 w-4" />
          {kind === 'bug' ? t('concierge.bug', 'Report a bug') : t('concierge.feedback', 'Send feedback')}
        </PressableButton>
      }
    >
      <div className="flex gap-2">
        <button type="button" onClick={() => setKind('bug')} className={TAB_CLASSES(kind === 'bug')}>
          {t('board.tabBugs', 'Bugs')}
        </button>
        <button type="button" onClick={() => setKind('feedback')} className={TAB_CLASSES(kind === 'feedback')}>
          {t('board.tabIdeas', 'Ideas')}
        </button>
      </div>

      <div className="flex gap-2">
        {(['top', 'new'] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setSort(option)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              sort === option ? 'bg-black/10 text-black' : 'text-black/50'
            }`}
          >
            {option === 'top' ? t('board.sortTop', 'Top') : t('board.sortNew', 'New')}
          </button>
        ))}
      </div>

      {isLoading ? <p className="py-6 text-center text-sm text-gray-500">{t('common.loading', 'Loading…')}</p> : null}

      {isError ? (
        <p className="py-6 text-center text-sm text-gray-500">{t('board.error', 'Could not load the board.')}</p>
      ) : null}

      {!isLoading && !isError && entries?.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">{t('board.empty', 'Nothing here yet. Be the first to post.')}</p>
      ) : null}

      {entries?.map((entry) => (
        <article key={entry.id} className="flex gap-3 rounded-xl border border-black border-b-2 bg-white p-3">
          {/* El voto va a la izquierda, alto y ancho fijos: es la única acción de
              la tarjeta, y así se toca sin apuntar. */}
          <button
            type="button"
            onClick={() => void handleVote(entry)}
            disabled={vote.isPending}
            aria-pressed={entry.hasVoted}
            aria-label={t('board.vote', 'Upvote')}
            className={`flex h-fit w-11 shrink-0 flex-col items-center rounded-lg border px-1 py-1.5 transition disabled:opacity-60 ${
              entry.hasVoted ? 'border-black bg-primary text-black' : 'border-black/20 bg-white text-black/70'
            }`}
          >
            <FiChevronUp className="h-4 w-4" />
            <span className="text-sm font-bold tabular-nums">{entry.voteCount}</span>
          </button>

          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-bold break-words text-black">{entry.title}</h3>
              {STATUS_STYLES[entry.status] ? (
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[entry.status]}`}>
                  {t(`board.status.${entry.status}`, entry.status)}
                </span>
              ) : null}
            </div>

            {entry.details ? (
              <p className="line-clamp-3 text-xs break-words whitespace-pre-wrap text-gray-600">{entry.details}</p>
            ) : null}

            {entry.attachmentIds.length > 0 ? (
              <div className="flex gap-1.5 pt-0.5">
                {entry.attachmentIds.map((id) => (
                  // eslint-disable-next-line @next/next/no-img-element -- lo sirve la API, no pasa por el optimizador
                  <img
                    key={id}
                    src={feedbackAttachmentUrl(id)}
                    alt=""
                    loading="lazy"
                    className="h-12 w-12 rounded-md border border-black/10 object-cover"
                  />
                ))}
              </div>
            ) : null}

            {entry.authorNickname ? <span className="text-[11px] text-gray-400">@{entry.authorNickname}</span> : null}
          </div>
        </article>
      ))}
    </AppModal>
  );
}
