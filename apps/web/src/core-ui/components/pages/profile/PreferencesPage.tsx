'use client';

import { ListBox, Select, Switch, toast } from '@heroui/react';
import React, { useEffect, useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { useProfileData, useRestProfile } from '../../../hooks';
import { useConfigStore } from '../../../stores';
import { MockedSubPageLayout } from './MockedSubPageLayout';

type Option = { id: string; label: string; hint?: string };

/**
 * A Hero UI Select rendered as a popover dropdown — i.e. the option list
 * floats above the page instead of pushing siblings down, exactly like Hero
 * UI's docs.
 */
function OptionSelect({
  title,
  description,
  options,
  value,
  onChange,
  ariaLabel,
}: {
  title: string;
  description: string;
  options: Option[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 px-1">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-500">{title}</h2>
        <p className="text-xs text-gray-500">{description}</p>
      </div>
      <Select
        aria-label={ariaLabel}
        value={value}
        onChange={(next) => {
          if (typeof next === 'string' && next) onChange(next);
        }}
        className="w-full"
      >
        <Select.Trigger className="w-full bg-white border border-black border-b-2 rounded-md px-4 h-16 flex items-center justify-between hover:bg-[#FFF7E6] transition data-[focus-visible]:outline-none data-[focus-visible]:border-primary">
          <Select.Value>
            {({ state }) => {
              const selected = state?.selectedItem;
              const opt = selected
                ? options.find((o) => o.id === String(selected.key))
                : options.find((o) => o.id === value);
              if (!opt) {
                return <span className="text-sm text-gray-400">Select an option…</span>;
              }
              return (
                <div className="flex flex-col items-start min-w-0">
                  <span className="text-[15px] font-extrabold text-black truncate">{opt.label}</span>
                  {opt.hint && (
                    <span className="text-xs text-gray-500 truncate">{opt.hint}</span>
                  )}
                </div>
              );
            }}
          </Select.Value>
          <Select.Indicator>
            <FiChevronDown className="text-gray-500 shrink-0 transition-transform data-[open]:rotate-180" />
          </Select.Indicator>
        </Select.Trigger>
        <Select.Popover
          placement="bottom"
          className="bg-white border border-black border-b-2 rounded-md shadow-lg max-h-72 overflow-auto w-[var(--trigger-width)]"
        >
          <ListBox className="py-1">
            {options.map((opt) => (
              <ListBox.Item
                key={opt.id}
                id={opt.id}
                textValue={opt.label}
                className="px-4 py-3 cursor-pointer outline-none data-[focused]:bg-[#FFF7E6] data-[selected]:bg-[#FFF7E6] flex items-center justify-between gap-3"
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold text-black truncate">{opt.label}</span>
                  {opt.hint && (
                    <span className="text-xs text-gray-500 truncate">{opt.hint}</span>
                  )}
                </div>
                <ListBox.ItemIndicator className="text-primary" />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </section>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-4 px-4 py-4 rounded-2xl border border-black border-b-2 bg-white cursor-pointer hover:bg-[#FFF7E6] transition">
      <div className="flex flex-col min-w-0">
        <span className="text-[15px] font-extrabold text-black">{label}</span>
        <span className="text-xs text-gray-500">{description}</span>
      </div>
      <Switch isSelected={value} onChange={(v) => onChange(v)} aria-label={label} />
    </label>
  );
}

/**
 * Like {@link ToggleRow} but persisted: it renders the visible Hero UI thumb
 * (the bare `<Switch>` above shows no knob — see EditProfilePage) and reflects
 * a saving/disabled state while the PATCH is in flight.
 */
function PersistedToggleRow({
  label,
  description,
  value,
  isDisabled,
  isSaving,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  isDisabled?: boolean;
  isSaving?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-4 rounded-2xl border border-black border-b-2 bg-white">
      <div className="flex flex-col min-w-0">
        <span className="text-[15px] font-extrabold text-black">{label}</span>
        <span className="text-xs text-gray-500">{description}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`text-xs font-semibold ${value ? 'text-green-600' : 'text-gray-400'}`}>
          {isSaving ? 'Saving…' : value ? 'On' : 'Off'}
        </span>
        <Switch isSelected={value} onChange={onChange} isDisabled={isDisabled} aria-label={label}>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
        </Switch>
      </div>
    </div>
  );
}

export function PreferencesPage() {
  const { walletAddress, network } = useConfigStore();
  const { data, isLoading, refetch } = useProfileData();
  const { saveProfileFlags } = useRestProfile();

  // Backend-driven (from `GET /api/v1/config` → config store), no longer hardcoded.
  const currencies: Option[] = network?.currencies ?? [];
  const languages: Option[] = network?.languages ?? [];

  const [language, setLanguage] = useState('en');
  const [currency, setCurrency] = useState('usd');

  // Default each selection to the first backend option once the list loads, if
  // the current pick isn't offered (e.g. the seeded 'usd' / 'en' fallback).
  useEffect(() => {
    if (currencies.length > 0 && !currencies.some((c) => c.id === currency)) {
      setCurrency(currencies[0].id);
    }
  }, [currencies, currency]);

  useEffect(() => {
    if (languages.length > 0 && !languages.some((l) => l.id === language)) {
      setLanguage(languages[0].id);
    }
  }, [languages, language]);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hapticFeedback, setHapticFeedback] = useState(true);
  const [autoplaySounds, setAutoplaySounds] = useState(true);

  const [cryptoSavvy, setCryptoSavvy] = useState(false);
  const [savingCryptoSavvy, setSavingCryptoSavvy] = useState(false);

  useEffect(() => {
    setCryptoSavvy(data?.cryptoSavvy ?? false);
  }, [data?.cryptoSavvy]);

  const handleToggleCryptoSavvy = async (value: boolean) => {
    if (!walletAddress || savingCryptoSavvy) return;
    const prev = cryptoSavvy;
    setCryptoSavvy(value); // optimistic; reverted on failure
    setSavingCryptoSavvy(true);
    try {
      const { success, message } = await saveProfileFlags({ cryptoSavvy: value });
      if (success) {
        toast.success('Preferences updated', { timeout: 2000 });
        refetch();
      } else {
        setCryptoSavvy(prev);
        toast.danger('Could not update preferences', { description: message, timeout: 4000 });
      }
    } catch (error) {
      setCryptoSavvy(prev);
      toast.danger('Could not update preferences', {
        description: (error as { message?: string })?.message ?? '',
        timeout: 4000,
      });
    } finally {
      setSavingCryptoSavvy(false);
    }
  };

  const handleSave = () => {
    toast.success('Preferences saved (mock)', { timeout: 2000 });
  };

  return (
    <MockedSubPageLayout
      title="Preferences"
      subtitle="Language, currency and display options. Saved locally for now."
    >
      <OptionSelect
        title="Language"
        description="The language Vaquita uses to talk to you."
        options={languages}
        value={language}
        onChange={setLanguage}
        ariaLabel="Language"
      />

      <OptionSelect
        title="Currency"
        description="Used to display your balances and rewards."
        options={currencies}
        value={currency}
        onChange={setCurrency}
        ariaLabel="Currency"
      />

      <section className="flex flex-col gap-2">
        <div className="flex flex-col gap-0.5 px-1">
          <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-500">
            Crypto mode
          </h2>
          <p className="text-xs text-gray-500">
            How much blockchain detail Vaquita shows you. Saved to your profile.
          </p>
        </div>
        <PersistedToggleRow
          label="I know crypto"
          description="Show raw on-chain details (wallet addresses, tx hashes, network terms) instead of simplified copy."
          value={cryptoSavvy}
          isDisabled={!walletAddress || isLoading || savingCryptoSavvy}
          isSaving={savingCryptoSavvy}
          onChange={handleToggleCryptoSavvy}
        />
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-extrabold uppercase tracking-wider text-gray-500 px-1">
          Display
        </h2>
        <div className="flex flex-col gap-3">
          <ToggleRow
            label="Reduce motion"
            description="Disable bouncy animations across the app."
            value={reducedMotion}
            onChange={setReducedMotion}
          />
          <ToggleRow
            label="Haptic feedback"
            description="Vibrate on key actions on supported devices."
            value={hapticFeedback}
            onChange={setHapticFeedback}
          />
          <ToggleRow
            label="Autoplay sound effects"
            description="Play the moo and coin sounds during interactions."
            value={autoplaySounds}
            onChange={setAutoplaySounds}
          />
        </div>
      </section>

      <button
        type="button"
        onClick={handleSave}
        className="w-full h-12 rounded-md bg-primary hover:bg-primary/80 text-black border border-black border-b-3 text-sm font-extrabold uppercase tracking-wider transition shadow-sm hover:-translate-y-0.5"
      >
        Save changes
      </button>
    </MockedSubPageLayout>
  );
}
