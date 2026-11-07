import { describe, expect, it, vi } from 'vitest';
import {
  WalletCreateFailedError,
  WalletNotReadyError,
  waitForWalletReady,
  type WalletProvisioning,
  type WalletReadyClient,
} from './walletReady';

function clientThat(replay: WalletProvisioning | null, later?: () => void): WalletReadyClient & { emit: (value: WalletProvisioning) => void; stopped: () => boolean } {
  let emit: (value: WalletProvisioning) => void = () => {};
  let stopped = false;
  return {
    onWalletStateChange(cb) {
      emit = cb;
      if (replay) cb(replay);
      later?.();
      return () => {
        stopped = true;
      };
    },
    emit: (value) => emit(value),
    stopped: () => stopped,
  };
}

describe('waitForWalletReady', () => {
  it('resuelve de inmediato cuando la cuenta ya está lista', async () => {
    const client = clientThat('READY');
    await waitForWalletReady(client, 50);
    await Promise.resolve();
    expect(client.stopped()).toBe(true);
  });

  it('espera mientras la cuenta se está creando y sigue cuando queda lista', async () => {
    const client = clientThat('CREATING');
    const pending = waitForWalletReady(client, 1_000);
    client.emit('READY');
    await pending;
  });

  it('no trata NONE como una cuenta que ya puede firmar', async () => {
    const client = clientThat('NONE');
    const pending = waitForWalletReady(client, 1_000);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    client.emit('READY');
    await pending;
  });

  it('falla si la creación de la cuenta falla', async () => {
    const client = clientThat('FAILED');
    await expect(waitForWalletReady(client, 50)).rejects.toBeInstanceOf(WalletCreateFailedError);
  });

  it('falla si la cuenta no queda lista a tiempo', async () => {
    vi.useFakeTimers();
    const client = clientThat('CREATING');
    const pending = waitForWalletReady(client, 90);
    const assertion = expect(pending).rejects.toBeInstanceOf(WalletNotReadyError);
    await vi.advanceTimersByTimeAsync(90);
    await assertion;
    vi.useRealTimers();
  });
});
