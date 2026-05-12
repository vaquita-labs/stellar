'use client';

import { ListBox, Select, Switch, toast } from '@heroui/react';
import React, { useState } from 'react';
import { FiChevronDown } from 'react-icons/fi';
import { MockedSubPageLayout } from './MockedSubPageLayout';

type Option = { id: string; label: string; hint?: string };

const LANGUAGES: Option[] = [
  { id: 'en', label: 'English', hint: 'United States' },
  { id: 'es', label: 'Español', hint: 'América Latina' },
  { id: 'pt', label: 'Português', hint: 'Brasil' },
  { id: 'fr', label: 'Français', hint: 'France' },
];

const CURRENCIES: Option[] = [
  { id: 'usd', label: 'USD', hint: 'US Dollar' },
  { id: 'eur', label: 'EUR', hint: 'Euro' },
  { id: 'cop', label: 'COP', hint: 'Peso colombiano' },
  { id: 'mxn', label: 'MXN', hint: 'Peso mexicano' },
];

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

export function PreferencesPage() {
  const [language, setLanguage] = useState('en');
  const [currency, setCurrency] = useState('usd');
  const [reducedMotion, setReducedMotion] = useState(false);
  const [hapticFeedback, setHapticFeedback] = useState(true);
  const [autoplaySounds, setAutoplaySounds] = useState(true);

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
        options={LANGUAGES}
        value={language}
        onChange={setLanguage}
        ariaLabel="Language"
      />

      <OptionSelect
        title="Currency"
        description="Used to display your balances and rewards."
        options={CURRENCIES}
        value={currency}
        onChange={setCurrency}
        ariaLabel="Currency"
      />

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
