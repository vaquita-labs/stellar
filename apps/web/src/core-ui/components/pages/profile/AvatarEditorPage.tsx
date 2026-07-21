'use client';

import {
  EDITABLE_CATEGORIES,
  PALETTES,
  composeOptionPreview,
  paletteColor,
  normalizeAvatarConfig,
  randomAvatarConfig,
  resolveAvatarConfig,
  type AvatarCategory,
  type AvatarConfig,
} from '@vaquita/avatar';
import { toast } from '@heroui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiCheck, FiX } from 'react-icons/fi';
import { GiBeard, GiBilledCap } from 'react-icons/gi';
import { LuDices, LuEye, LuGem, LuGlasses, LuPalette, LuScissors, LuShirt, LuSmile, LuUserRound } from 'react-icons/lu';
import type { IconType } from 'react-icons';
import { useProfileData, useRestProfile } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { VaquitaAvatar } from '../../avatar/VaquitaAvatar';

/**
 * Category → tab icon. Lives here, not in the catalog, so `@vaquita/avatar`
 * stays free of React. A category with no entry falls back to the generic
 * person glyph, so a newly added one still renders a usable tab.
 *
 * Preference is Lucide (thin, uniform line weight, legible at 20px). Game Icons
 * are only used where Lucide has no equivalent — their denser glyphs turn to
 * noise at this size, which is why hair is scissors and earrings is a gem.
 */
const CATEGORY_ICONS: Record<string, IconType> = {
  skin: LuUserRound,
  background: LuPalette,
  clothes: LuShirt,
  eyes: LuEye,
  mouth: LuSmile,
  facialHair: GiBeard,
  hair: LuScissors,
  earrings: LuGem,
  glasses: LuGlasses,
  hat: GiBilledCap,
};

/**
 * The avatar builder. There are no photo uploads anywhere in the product — a
 * profile picture is a character assembled here from the @vaquita/avatar
 * catalog, and the whole screen is generated from that catalog: tabs, sections,
 * swatches and option thumbnails all come from `EDITABLE_CATEGORIES`. Shipping
 * new cosmetics (earrings, jackets, hats…) means editing the catalog, not this
 * file.
 */
export function AvatarEditorPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { walletAddress } = useConfigStore();
  const { data: profileData, refetch } = useProfileData();
  const { saveAvatar } = useRestProfile();
  const queryClient = useQueryClient();

  const [config, setConfig] = useState<AvatarConfig | null>(null);
  const [activeTab, setActiveTab] = useState<string>(EDITABLE_CATEGORIES[0]?.id ?? 'hair');
  const [saving, setSaving] = useState(false);

  // Seed the editor from the persisted avatar once it arrives. Guarded on
  // `config` so a background refetch can't discard edits in progress.
  useEffect(() => {
    if (config) return;
    if (!profileData) return;
    setConfig(resolveAvatarConfig(profileData.avatarConfig, profileData.walletAddress || walletAddress || ''));
  }, [profileData, walletAddress, config]);

  const draft = config ?? resolveAvatarConfig(profileData?.avatarConfig, walletAddress ?? '');

  const saved = useMemo(
    () => resolveAvatarConfig(profileData?.avatarConfig, profileData?.walletAddress || walletAddress || ''),
    [profileData?.avatarConfig, profileData?.walletAddress, walletAddress]
  );
  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);

  const set = useCallback((key: string, value: string | number) => {
    setConfig((prev) => normalizeAvatarConfig({ ...(prev ?? {}), [key]: value }));
  }, []);

  const handleSave = async () => {
    if (!walletAddress || saving) return;
    setSaving(true);
    try {
      const { success, message } = await saveAvatar(draft);
      if (!success) {
        toast.danger(t('profilePages.avatar.couldNotSave', 'Could not save your avatar'), {
          description: message,
          timeout: 4000,
        });
        return;
      }
      toast.success(t('profilePages.avatar.saved', 'Avatar saved'), { timeout: 2000 });
      await refetch();
      // Lists cache avatars with staleTime: Infinity and refetchOnMount: false,
      // so they'd keep drawing the old character. 'all' also refetches the
      // inactive ones (the leaderboard is unmounted while we're on this page).
      void queryClient.invalidateQueries({ queryKey: ['profiles'], refetchType: 'all' });
      router.push('/profile');
    } catch (error) {
      toast.danger(t('profilePages.avatar.couldNotSave', 'Could not save your avatar'), {
        description: (error as { message?: string })?.message ?? '',
        timeout: 4000,
      });
    } finally {
      setSaving(false);
    }
  };

  const category = EDITABLE_CATEGORIES.find((c) => c.id === activeTab);
  const previewBackground = paletteColor('background', draft['backgroundColor'] as number);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      {/* Top bar — close / title / randomise */}
      <div className="flex shrink-0 items-center justify-between gap-2 px-4 py-3">
        <button
          type="button"
          onClick={() => router.push('/profile')}
          aria-label={t('common.cancel')}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-black border-b-2 bg-white text-black transition hover:bg-black/5"
        >
          <FiX className="h-5 w-5" />
        </button>
        <span className="text-base font-extrabold text-black">
          {t('profilePages.avatar.title', 'Edit avatar')}
        </span>
        <button
          type="button"
          onClick={() => setConfig(randomAvatarConfig())}
          aria-label={t('profilePages.avatar.randomize', 'Surprise me')}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-black border-b-2 bg-white text-black transition hover:bg-black/5"
        >
          <LuDices className="h-5 w-5" />
        </button>
      </div>

      {/* Live preview — the same bust crop the profile banner uses. Capped at a
          third of the viewport so the option grid always has room to breathe;
          the avatar's own background floods the rest of the strip. */}
      <div
        className="flex h-[32vh] shrink-0 items-center justify-center overflow-hidden border-y-2 border-black/10"
        style={{ backgroundColor: previewBackground }}
      >
        <VaquitaAvatar
          config={draft}
          crop="bust"
          background={false}
          className="block h-full [&_svg]:block [&_svg]:h-full [&_svg]:w-auto"
        />
      </div>

      {/* Category tabs. They overflow on narrow screens by design — scrolling a
          strip beats shrinking icons until they're unreadable. */}
      <div
        role="tablist"
        aria-label={t('profilePages.avatar.title', 'Edit avatar')}
        className="flex shrink-0 items-center gap-1 overflow-x-auto border-b-2 border-black/10 px-2 no-scrollbar"
      >
        {EDITABLE_CATEGORIES.map((c) => {
          const selected = c.id === activeTab;
          const Icon = CATEGORY_ICONS[c.id] ?? LuUserRound;
          return (
            <button
              key={c.id}
              role="tab"
              aria-selected={selected}
              aria-label={categoryLabel(t, c)}
              title={categoryLabel(t, c)}
              onClick={() => setActiveTab(c.id)}
              className={`shrink-0 border-b-4 px-3.5 pb-2.5 pt-2.5 transition ${
                selected ? 'border-primary text-black' : 'border-transparent text-gray-400 hover:text-gray-600'
              }`}
            >
              <Icon className="h-5 w-5" aria-hidden />
            </button>
          );
        })}
      </div>

      {/* Options for the active tab */}
      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4">
        {category?.palette && category.colorKey && (
          <Swatches
            title={t(`profilePages.avatar.color.${category.i18nKey}`, {
              defaultValue: t('profilePages.avatar.colorGeneric', 'Color'),
            })}
            colors={PALETTES[category.palette]}
            value={(draft[category.colorKey] as number) ?? 0}
            onSelect={(i) => set(category.colorKey as string, i)}
          />
        )}

        {category && !category.colorOnly && (
          <>
            <h3 className="mb-2 mt-5 text-sm font-extrabold text-black first:mt-0">
              {categoryLabel(t, category)}
            </h3>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
              {category.options.map((option) => {
                const selected = draft[category.id] === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    aria-label={partLabel(t, category, option.id)}
                    onClick={() => set(category.id, option.id)}
                    className={`overflow-hidden rounded-2xl border-2 bg-[#FAF3E3] p-1 transition ${
                      selected
                        ? 'border-primary ring-2 ring-primary/40'
                        : 'border-black/15 hover:border-black/40'
                    }`}
                  >
                    <span
                      className="block [&_svg]:block [&_svg]:h-auto [&_svg]:w-full"
                      // eslint-disable-next-line react/no-danger -- catalog-generated SVG, no user input
                      dangerouslySetInnerHTML={{
                        __html: composeOptionPreview(draft, category.id, option.id, `-${category.id}-${option.id}`),
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Save */}
      <div className="shrink-0 border-t border-black/10 bg-background px-4 py-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={!walletAddress || saving || !isDirty}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-md border border-black border-b-3 bg-primary text-sm font-bold uppercase tracking-wide text-black transition hover:-translate-y-0.5 disabled:pointer-events-none disabled:opacity-50"
        >
          <FiCheck className="h-4 w-4" />
          {saving ? t('common.saving') : t('profilePages.avatar.save', 'Save avatar')}
        </button>
      </div>
    </div>
  );
}

function Swatches({
  title,
  colors,
  value,
  onSelect,
}: {
  title: string;
  colors: readonly string[];
  value: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="mb-1">
      <h3 className="mb-2 text-sm font-extrabold text-black">{title}</h3>
      <div className="flex flex-wrap gap-2.5">
        {colors.map((color, index) => (
          <button
            key={color}
            type="button"
            aria-label={color}
            aria-pressed={index === value}
            onClick={() => onSelect(index)}
            style={{ background: color }}
            className={`h-11 w-11 rounded-xl border-2 transition ${
              index === value ? 'border-primary ring-2 ring-primary/40' : 'border-black/20 hover:border-black/50'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

/** i18n keys are derived from the catalog, so a new category/part only needs
 *  its strings added — with a readable English fallback until they are. */
type Translate = ReturnType<typeof useTranslation>['t'];

function categoryLabel(t: Translate, category: AvatarCategory): string {
  return t(`profilePages.avatar.category.${category.i18nKey}`, {
    defaultValue: humanize(category.i18nKey),
  });
}

function partLabel(t: Translate, category: AvatarCategory, partId: string): string {
  return t(`profilePages.avatar.part.${category.i18nKey}.${partId}`, {
    defaultValue: humanize(partId),
  });
}

function humanize(id: string): string {
  return id.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}
