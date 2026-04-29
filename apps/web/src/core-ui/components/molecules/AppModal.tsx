'use client';

import { Modal } from '@heroui/react';
import Image from 'next/image';
import { ReactNode } from 'react';

export type AppModalSize = 'sm' | 'md' | 'lg';

export interface AppModalProps {
  open: boolean;
  onOpenChange: () => void;
  title: ReactNode;
  titleIcon?: string;
  titleIconAlt?: string;
  size?: AppModalSize;
  children: ReactNode;
  footer?: ReactNode;
  isDismissable?: boolean;
  bodyClassName?: string;
  dialogClassName?: string;
}

const SCROLLBAR_CLASSES =
  '[scrollbar-width:thin] [scrollbar-color:rgba(0,0,0,0.3)_transparent] ' +
  '[&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar]:bg-transparent ' +
  '[&::-webkit-scrollbar-thumb]:bg-black/30 [&::-webkit-scrollbar-thumb]:rounded-full';

const SLOW_EXIT = 'data-[exiting=true]:duration-300';

export function AppModal({
  open,
  onOpenChange,
  title,
  titleIcon,
  titleIconAlt = '',
  size = 'md',
  children,
  footer,
  isDismissable = true,
  bodyClassName,
  dialogClassName,
}: AppModalProps) {
  return (
    <Modal.Backdrop
      isOpen={open}
      isDismissable={isDismissable}
      onOpenChange={(o) => { if (!o) onOpenChange(); }}
      className={SLOW_EXIT}
    >
      <Modal.Container size={size} scroll="inside" className="px-0! py-3! sm:p-10!">
        <Modal.Dialog
          className={
            'bg-background border border-black ' +
            'max-h-[85dvh] sm:max-h-[90vh] ' +
            'rounded-2xl p-0! ' +
            SLOW_EXIT + ' ' +
            (dialogClassName ?? '')
          }
        >
          <Modal.Header className="flex-row! items-center gap-3 px-5 sm:px-6 pt-4 pb-3 border-b border-black/10">
            {titleIcon ? (
              <Image src={titleIcon} alt={titleIconAlt} width={22} height={22} />
            ) : null}
            <Modal.Heading className="text-black font-bold text-base flex-1 min-w-0 truncate">
              {title}
            </Modal.Heading>
            <Modal.CloseTrigger
              aria-label="Close"
              className='bg-primary text-black text-sm border-[0.5] border-black'
            >
            </Modal.CloseTrigger>
          </Modal.Header>
          <Modal.Body
            className={
              'px-5 sm:px-6 py-4 overflow-y-auto ' + SCROLLBAR_CLASSES + ' ' + (bodyClassName ?? '')
            }
          >
            {children}
          </Modal.Body>
          {footer ? (
            <Modal.Footer className="px-5 sm:px-6 pt-3 pb-5 border-t border-black/10">
              {footer}
            </Modal.Footer>
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
