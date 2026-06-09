'use client';

import { ListBox, Select, Spinner } from '@heroui/react';
import { useRouter } from 'next/navigation';
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiBell, FiCalendar, FiChevronDown, FiFilter, FiGift, FiTrendingUp, FiUsers, FiZap } from 'react-icons/fi';
import { TfiBrushAlt } from 'react-icons/tfi';
import {
  AppNotification,
  NotificationType,
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from '../../../hooks';
import { PageLayout, WithHydrated } from '../../molecules';

type DateFilter = 'all' | 'today' | 'week' | 'month';
type TypeFilter = 'all' | NotificationType;

const DATE_FILTERS: DateFilter[] = ['all', 'today', 'week', 'month'];
const TYPE_FILTERS: TypeFilter[] = ['all', 'deposit', 'reward', 'streak', 'friend', 'system'];

const TYPE_ICONS: Record<NotificationType, React.ReactNode> = {
  deposit: <FiTrendingUp />,
  reward: <FiGift />,
  streak: <FiZap />,
  friend: <FiUsers />,
  system: <FiBell />,
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const startOfDay = (ts: number) => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

function FilterSelect<T extends string>({
  icon,
  value,
  options,
  labels,
  onChange,
  ariaLabel,
}: {
  icon: React.ReactNode;
  value: T;
  options: readonly T[];
  labels: (option: T) => string;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <Select
      aria-label={ariaLabel}
      value={value}
      onChange={(next) => {
        if (typeof next === 'string' && next) onChange(next as T);
      }}
      className="flex-1 min-w-0"
    >
      <Select.Trigger className="w-full h-10 bg-white border border-black border-b-2 rounded-lg px-3 flex items-center gap-2 hover:bg-[#FFF7E6] transition data-[focus-visible]:outline-none data-[focus-visible]:border-primary">
        <span className="text-gray-500 shrink-0">{icon}</span>
        <span className="flex-1 min-w-0 text-left text-sm font-semibold text-black truncate">{labels(value)}</span>
        <Select.Indicator>
          <FiChevronDown className="text-gray-500 shrink-0 transition-transform data-[open]:rotate-180" />
        </Select.Indicator>
      </Select.Trigger>
      <Select.Popover
        placement="bottom"
        className="bg-white border border-black border-b-2 rounded-lg shadow-lg max-h-72 overflow-auto w-[var(--trigger-width)]"
      >
        <ListBox className="py-1">
          {options.map((option) => (
            <ListBox.Item
              key={option}
              id={option}
              textValue={labels(option)}
              className="px-3 py-2.5 cursor-pointer outline-none data-[focused]:bg-[#FFF7E6] data-[selected]:bg-[#FFF7E6] flex items-center justify-between gap-2"
            >
              <span className="text-sm font-semibold text-black truncate">{labels(option)}</span>
              <ListBox.ItemIndicator className="text-primary" />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}

function NotificationItem({
  notification,
  onPress,
}: {
  notification: AppNotification;
  onPress: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { type, messageKey, params, link, createdAt, read } = notification;

  const elapsed = Date.now() - createdAt;
  let timeLabel: string;
  if (elapsed < MINUTE) {
    timeLabel = t('notificationsCenter.time.justNow', 'Just now');
  } else if (elapsed < HOUR) {
    timeLabel = t('notificationsCenter.time.minutesAgo', { count: Math.floor(elapsed / MINUTE) });
  } else if (elapsed < DAY) {
    timeLabel = t('notificationsCenter.time.hoursAgo', { count: Math.floor(elapsed / HOUR) });
  } else {
    timeLabel = new Date(createdAt).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
  }

  // Unknown keys (e.g. a newer backend) fall back to a generic copy instead of
  // leaking raw i18n keys.
  const title = t(`notificationsCenter.messages.${messageKey}.title`, {
    ...params,
    defaultValue: t('notificationsCenter.messages.generic.title', 'Notification'),
  });
  const body = t(`notificationsCenter.messages.${messageKey}.body`, {
    ...params,
    defaultValue: '',
  });

  return (
    <li>
      <button
        type="button"
        onClick={onPress}
        className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors ${
          read ? 'bg-white' : 'bg-[#FFF4E5]'
        } ${link ? 'cursor-pointer hover:bg-[#FFF7E6]' : 'cursor-default'}`}
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#DDF4FF] border border-[#84D8FF] text-black shrink-0">
          {TYPE_ICONS[type] ?? <FiBell />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className={`text-sm text-black truncate ${read ? 'font-semibold' : 'font-bold'}`}>{title}</p>
            <span className="shrink-0 text-[11px] text-gray-500">{timeLabel}</span>
          </div>
          {body && <p className="text-xs text-gray-600">{body}</p>}
        </div>
        {!read && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />}
      </button>
    </li>
  );
}

export function NotificationsCenterPage() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const { data, isLoading } = useNotifications();
  const { mutate: markRead } = useMarkNotificationRead();
  const { mutate: markAllRead } = useMarkAllNotificationsRead();

  const notifications = useMemo(() => data?.notifications ?? [], [data]);
  const unreadCount = data?.unread ?? 0;

  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');

  // Agrupado por día (desc) tras aplicar ambos filtros; las cabeceras de grupo
  // son Hoy / Ayer / fecha localizada.
  const groups = useMemo(() => {
    const now = Date.now();
    const todayStart = startOfDay(now);
    const minDate =
      dateFilter === 'today' ? todayStart : dateFilter === 'week' ? now - 7 * DAY : dateFilter === 'month' ? now - 30 * DAY : 0;

    const filtered = notifications
      .filter((n) => n.createdAt >= minDate && (typeFilter === 'all' || n.type === typeFilter))
      .sort((a, b) => b.createdAt - a.createdAt);

    const byDay = new Map<number, AppNotification[]>();
    for (const n of filtered) {
      const day = startOfDay(n.createdAt);
      const list = byDay.get(day) ?? [];
      list.push(n);
      byDay.set(day, list);
    }

    return Array.from(byDay.entries()).map(([day, items]) => {
      const label =
        day === todayStart
          ? t('notificationsCenter.groups.today', 'Today')
          : day === todayStart - DAY
            ? t('notificationsCenter.groups.yesterday', 'Yesterday')
            : new Date(day).toLocaleDateString(i18n.language, { day: 'numeric', month: 'long' });
      return { day, label, items };
    });
  }, [notifications, dateFilter, typeFilter, t, i18n.language]);

  const onNotificationPress = (n: AppNotification) => {
    if (!n.read) {
      markRead(n.id);
    }
    if (n.link) {
      router.push(n.link);
    }
  };

  return (
    <PageLayout
      title={t('notificationsCenter.title', 'Notifications')}
      backHref="/home"
      rightSlot={
        <button
          type="button"
          onClick={() => markAllRead('')}
          disabled={unreadCount === 0}
          aria-label={t('notificationsCenter.markAllRead', 'Mark all as read')}
          title={t('notificationsCenter.markAllRead', 'Mark all as read')}
          className={`flex h-9 w-9 items-center justify-center rounded-full border border-black border-b-2 bg-white text-black transition-opacity ${
            unreadCount === 0 ? 'opacity-40 cursor-not-allowed' : ''
          }`}
        >
          <TfiBrushAlt className="h-5 w-5" />
        </button>
      }
    >
      <WithHydrated>
        <div className="flex gap-2">
          <FilterSelect
            icon={<FiCalendar />}
            value={dateFilter}
            options={DATE_FILTERS}
            labels={(f) => t(`notificationsCenter.filters.date.${f}`)}
            onChange={setDateFilter}
            ariaLabel={t('notificationsCenter.filters.dateAria', 'Filter by date')}
          />
          <FilterSelect
            icon={<FiFilter />}
            value={typeFilter}
            options={TYPE_FILTERS}
            labels={(f) => t(`notificationsCenter.filters.type.${f}`)}
            onChange={setTypeFilter}
            ariaLabel={t('notificationsCenter.filters.typeAria', 'Filter by type')}
          />
        </div>

        {isLoading && !data ? (
          <div className="flex justify-center py-12">
            <Spinner size="md" color="current" />
          </div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-black border-b-2 bg-white px-4 py-10 text-center">
            <FiBell className="h-7 w-7 text-gray-400" />
            <p className="text-sm font-semibold text-black">
              {t('notificationsCenter.empty', 'No notifications here yet')}
            </p>
            <p className="text-xs text-gray-600">
              {t('notificationsCenter.emptyFiltered', 'Try changing the filters to see more.')}
            </p>
          </div>
        ) : (
          groups.map(({ day, label, items }) => (
            <section key={day} className="flex flex-col gap-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500 px-1">{label}</h2>
              <ul className="rounded-lg border border-black border-b-2 bg-white overflow-hidden divide-y divide-gray-200">
                {items.map((n) => (
                  <NotificationItem key={n.id} notification={n} onPress={() => onNotificationPress(n)} />
                ))}
              </ul>
            </section>
          ))
        )}
      </WithHydrated>
    </PageLayout>
  );
}
