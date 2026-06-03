'use client';

import { toast } from '@heroui/react';
import { ReactNode } from 'react';

export const addSuccessToast = (title: ReactNode, description: ReactNode = null) => {
  toast.success(title, { description: description ?? undefined, timeout: 4000 });
};

export const addDangerToast = (title: ReactNode, description: ReactNode) => {
  toast.danger(title, { description: description ?? undefined, timeout: 4000 });
};
