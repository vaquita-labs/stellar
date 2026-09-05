'use client';

import { toast } from '@heroui/react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiPaperclip, FiX } from 'react-icons/fi';
import { ATTACHMENT_ACCEPT, prepareAttachment } from '../../../helpers/imageAttachment';
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
/** Igual que `ATTACHMENTS_MAX` del backend. */
const ATTACHMENTS_MAX = 3;

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
 * El clip del diseño adjunta hasta tres capturas. Se reescalan en el cliente
 * antes de subirlas (`prepareAttachment`) porque la captura de un celular son
 * varios MB y lo que hace falta es ver la pantalla, no el detalle. El servidor
 * igual revalida tipo y tamaño: que el cliente achique es una optimización, no
 * una validación.
 *
 * Lo que se manda queda publicado en el board donde el resto puede votarlo, y el
 * formulario lo dice antes de mandar — no después.
 */
export function ReportSheet({ open, onOpenChange, kind }: ReportSheetProps) {
  const { t } = useTranslation();
  const submit = useSubmitFeedback();

  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [attachments, setAttachments] = useState<string[]>([]);
  const [preparing, setPreparing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // No hay reset explícito: el sheet se monta solo mientras está abierto (ver
  // `ConciergePage`), así que cerrar lo desmonta y el estado arranca vacío en la
  // próxima apertura. Un efecto que limpiara al abrir sería el mismo resultado
  // con un render de más.

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    // El hueco se calcula ANTES de procesar: sin esto, elegir 5 imágenes de una
    // deja pasar las 5 porque cada una ve el estado viejo.
    const room = ATTACHMENTS_MAX - attachments.length;
    if (room <= 0) return;

    setPreparing(true);
    try {
      const prepared = await Promise.all(Array.from(files).slice(0, room).map(prepareAttachment));
      const usable = prepared.filter((p) => p !== null).map((p) => p!.dataUrl);
      if (usable.length < prepared.length) {
        toast.danger(t('report.attachmentError', 'Some images could not be attached'), {
          description: t('report.attachmentErrorBody', 'Use a PNG, JPEG or WebP under 2 MB.'),
        });
      }
      if (usable.length > 0) setAttachments((current) => [...current, ...usable].slice(0, ATTACHMENTS_MAX));
    } finally {
      setPreparing(false);
      // Se resetea el input o elegir el mismo archivo dos veces no dispara change.
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const trimmedTitle = title.trim();
  const canSubmit = trimmedTitle.length > 0 && !submit.isPending && !preparing;

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
      await submit.mutateAsync({ kind, title: trimmedTitle, details: details.trim(), attachments });
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

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {attachments.map((dataUrl, index) => (
            <div key={dataUrl.slice(-32)} className="relative h-16 w-16 overflow-hidden rounded-md border border-black">
              {/* eslint-disable-next-line @next/next/no-img-element -- data URL local, no pasa por el optimizador */}
              <img src={dataUrl} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                aria-label={t('report.removeImage', 'Remove image')}
                onClick={() => setAttachments((current) => current.filter((_, i) => i !== index))}
                disabled={submit.isPending}
                className="absolute top-0 right-0 rounded-bl-md bg-black/70 p-0.5 text-white"
              >
                <FiX className="h-3 w-3" />
              </button>
            </div>
          ))}

          {attachments.length < ATTACHMENTS_MAX ? (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={submit.isPending || preparing}
              className="flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-black text-gray-600 disabled:opacity-50"
            >
              <FiPaperclip className="h-4 w-4" />
              <span className="text-[10px] font-bold">
                {preparing ? t('report.attaching', 'Adding…') : t('report.attach', 'Attach')}
              </span>
            </button>
          ) : null}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={ATTACHMENT_ACCEPT}
          multiple
          className="hidden"
          onChange={(e) => void handleFiles(e.target.files)}
        />

        <span className="text-xs text-gray-500">
          {/* `max`, no `count`: i18next trata `count` como plural y buscaría
              `report.attachHint_other` en vez de la clave. */}
          {t('report.attachHint', 'Up to {{max}} screenshots. Posted publicly on the board.', {
            max: ATTACHMENTS_MAX,
          })}
        </span>
      </div>
    </AppModal>
  );
}
