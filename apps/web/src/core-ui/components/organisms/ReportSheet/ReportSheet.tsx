'use client';

import { toast } from '@heroui/react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FeedbackKind, useSubmitFeedback } from '../../../hooks/useSubmitFeedback';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';

interface ReportSheetProps {
  open: boolean;
  onOpenChange: () => void;
  kind: FeedbackKind;
}

/** Topes del backend (`TITLE_MAX` / `DETAILS_MAX`). Se replican acá para cortar
 *  el tipeo en vez de dejar que el envío falle con un 400 después de escribir. */
const TITLE_MAX = 120;
const DETAILS_MAX = 2000;

const inputClasses =
  'w-full rounded-md border border-black border-b-2 bg-white px-3 text-black ' +
  'placeholder:text-gray-400 outline-none focus:border-b-3 disabled:opacity-50';

/**
 * Mandar un reporte desde adentro de la app: un bug o feedback.
 *
 * Un solo componente para los dos: el formulario es idéntico —título corto y
 * detalle— y lo único que cambia es la copy y a qué bandeja va (`kind`).
 * Duplicarlo en dos componentes solo garantizaría que uno se arregle y el otro no.
 *
 * El adjunto del diseño de referencia (el clip) quedó afuera a propósito: pide
 * bucket, subida firmada, validación de tipo/tamaño y moderación. El servidor
 * guarda ruta, idioma y user-agent, que es la mayor parte de lo que la captura
 * iba a contar sobre un bug.
 */
export function ReportSheet({ open, onOpenChange, kind }: ReportSheetProps) {
  const { t } = useTranslation();
  const submit = useSubmitFeedback();

  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');

  // Se limpia al abrir, no al cerrar: si el envío falla y el usuario reabre, no
  // queremos que reaparezca el texto de un intento anterior ya mandado.
  useEffect(() => {
    if (open) {
      setTitle('');
      setDetails('');
    }
  }, [open]);

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length > 0 && !submit.isPending;

  const isBug = kind === 'bug';
  const heading = isBug ? t('report.bug.title', 'Report a bug') : t('report.feedback.title', 'Send feedback');
  const intro = isBug
    ? t('report.bug.intro', 'Tell us what went wrong. The more detail, the faster we can fix it.')
    : t('report.feedback.intro', 'Tell us what would make Vaquita better. We read every message.');
  const titlePlaceholder = isBug
    ? t('report.bug.titlePlaceholder', 'e.g. The withdraw button does nothing')
    : t('report.feedback.titlePlaceholder', 'e.g. Let me rename my saved wallets');

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      await submit.mutateAsync({ kind, title: trimmedTitle, details: details.trim() });
      toast.success(t('report.successTitle', 'Report sent'), {
        description: t('report.successBody', 'Thanks — the team got it.'),
      });
      onOpenChange();
    } catch (e) {
      toast.danger(t('report.errorTitle', 'Could not send your report'), {
        description: (e as Error)?.message ?? t('report.errorBody', 'Please try again in a moment.'),
      });
    }
  };

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title={heading}
      size="md"
      bodyClassName="flex flex-col gap-4 pb-2"
      footer={
        <div className="flex w-full gap-3">
          <PressableButton
            variant="white"
            size="cta"
            className="flex-1 py-2.5!"
            onClick={onOpenChange}
            disabled={submit.isPending}
          >
            {t('common.cancel', 'Cancel')}
          </PressableButton>
          <PressableButton
            variant="primary"
            size="cta"
            className="flex-1 py-2.5!"
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            {submit.isPending ? t('report.sending', 'Sending…') : t('report.submit', 'Submit')}
          </PressableButton>
        </div>
      }
    >
      <p className="text-sm text-gray-600">{intro}</p>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-black">{t('report.titleField', 'Title')}</span>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={titlePlaceholder}
          maxLength={TITLE_MAX}
          disabled={submit.isPending}
          className={inputClasses + ' h-12'}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs font-bold text-black">{t('report.detailsField', 'Details')}</span>
        <textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder={t('report.detailsPlaceholder', 'Any additional details…')}
          maxLength={DETAILS_MAX}
          rows={5}
          disabled={submit.isPending}
          className={inputClasses + ' resize-none py-2.5 leading-relaxed'}
        />
        {/* Solo cuando se acerca al tope: un contador siempre visible mete presión
            de escribir corto justo donde queremos que escriban largo. */}
        {details.length > DETAILS_MAX - 200 ? (
          <span className="self-end text-xs text-gray-500 tabular-nums">
            {details.length} / {DETAILS_MAX}
          </span>
        ) : null}
      </label>
    </AppModal>
  );
}
