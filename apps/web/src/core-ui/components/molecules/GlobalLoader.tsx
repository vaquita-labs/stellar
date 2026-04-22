'use client';

import { LoaderScreen, T } from '@/core-ui/components';
import { useLoader } from '@/core-ui/stores';
import React, { useEffect, useState } from 'react';

export const GlobalLoader = () => {
  const loading = useLoader((store) => store.loading);

  const isLoading = Object.values(loading).some((loading) => loading);

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timeout: NodeJS.Timeout | null = null;

    if (isLoading) {
      setVisible(true);
    } else {
      timeout = setTimeout(() => setVisible(false), 1000);
    }

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [isLoading]);

  if (visible) {
    return (
      <LoaderScreen withImage key="loader">
        <></>
      </LoaderScreen>
    );
  }

  return null;
};
