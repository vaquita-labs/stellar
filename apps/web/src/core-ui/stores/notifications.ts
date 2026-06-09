import { create } from 'zustand';

/**
 * In-app notifications feed. Mock-only for now: the list is generated locally
 * with relative timestamps and lives in memory (no backend, no persistence).
 * Data holds i18n KEYS (`notificationsCenter.mock.*`) — translate at the
 * render site, never here.
 */
export type NotificationType = 'deposit' | 'reward' | 'streak' | 'friend' | 'system';

export type AppNotification = {
  id: string;
  type: NotificationType;
  /** i18n key suffix under `notificationsCenter.mock.<key>.{title,body}` */
  messageKey: string;
  params?: Record<string, string | number>;
  /** epoch ms */
  createdAt: number;
  read: boolean;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const buildMockNotifications = (): AppNotification[] => {
  const now = Date.now();
  const mock: Array<[NotificationType, string, number, boolean, AppNotification['params']?]> = [
    ['deposit', 'depositYield', now - 25 * MINUTE, false, { amount: '0.54' }],
    ['streak', 'streakReminder', now - 3 * HOUR, false],
    ['reward', 'goldCoins', now - 8 * HOUR, false, { amount: 25 }],
    ['friend', 'friendJoined', now - 1 * DAY - 2 * HOUR, false, { name: 'Valeria' }],
    ['reward', 'levelUp', now - 1 * DAY - 6 * HOUR, true, { level: 5 }],
    ['streak', 'streakMilestone', now - 3 * DAY, true, { days: 7 }],
    ['friend', 'friendSaved', now - 5 * DAY, true, { name: 'Mateo', amount: '50.00' }],
    ['deposit', 'depositUnlocked', now - 9 * DAY, true],
    ['system', 'newFeature', now - 12 * DAY, true],
    ['system', 'welcome', now - 20 * DAY, true],
  ];
  return mock.map(([type, messageKey, createdAt, read, params], i) => ({
    id: `mock-${i}-${messageKey}`,
    type,
    messageKey,
    params,
    createdAt,
    read,
  }));
};

type NotificationsState = {
  notifications: AppNotification[];
  markRead: (id: string) => void;
  markAllRead: () => void;
};

export const useNotificationsStore = create<NotificationsState>()((set) => ({
  notifications: buildMockNotifications(),
  markRead: (id) =>
    set((s) => ({
      notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
    })),
  markAllRead: () =>
    set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),
}));

export const useUnreadNotificationsCount = () =>
  useNotificationsStore((s) => s.notifications.reduce((acc, n) => acc + (n.read ? 0 : 1), 0));
