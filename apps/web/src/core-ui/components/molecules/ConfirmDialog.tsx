'use client';

import { AlertDialog, Spinner } from '@heroui/react';
import React, { ReactNode } from 'react';

export type ConfirmDialogStatus = 'default' | 'accent' | 'success' | 'warning' | 'danger';

interface ConfirmDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  icon?: ReactNode;
  status?: ConfirmDialogStatus;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  isConfirming?: boolean;
  confirmDisabled?: boolean;
}

const CONFIRM_BUTTON_BY_STATUS: Record<ConfirmDialogStatus, string> = {
  default: 'bg-black hover:bg-slate-800 text-white',
  accent: 'bg-primary hover:bg-primary/80 text-black',
  success: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  warning: 'bg-amber-500 hover:bg-amber-600 text-black',
  danger: 'bg-[#E11D48] hover:bg-[#BE123C] text-white',
};

export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  icon,
  status = 'danger',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  isConfirming = false,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  const confirmClasses = CONFIRM_BUTTON_BY_STATUS[status];

  return (
    <AlertDialog.Backdrop
      isOpen={isOpen}
      onOpenChange={(o) => {
        if (!o && !isConfirming) onOpenChange(false);
      }}
    >
      <AlertDialog.Container size="sm" placement="center">
        <AlertDialog.Dialog className="bg-background border border-black">
          <AlertDialog.Body className="pt-8 pb-2">
            <div className="flex flex-col items-center gap-3 text-center">
              {icon && <AlertDialog.Icon status={status}>{icon}</AlertDialog.Icon>}
              <AlertDialog.Heading className="text-xl font-bold text-black">{title}</AlertDialog.Heading>
              {description && <p className="text-sm text-gray-600">{description}</p>}
            </div>
          </AlertDialog.Body>
          <AlertDialog.Footer className="flex gap-3 pb-6 px-6 pt-4 [&>*]:flex-1">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              disabled={isConfirming}
              className="h-10 rounded-md bg-white hover:bg-white/80 text-black border border-black border-b-3 text-sm font-semibold transition shadow-sm hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={() => void onConfirm()}
              disabled={isConfirming || confirmDisabled}
              className={`h-10 rounded-md border border-black border-b-3 text-sm font-semibold transition shadow-sm hover:-translate-y-0.5 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center whitespace-nowrap ${confirmClasses}`}
            >
              {isConfirming ? <Spinner size="sm" color="current" /> : confirmLabel}
            </button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  );
}
