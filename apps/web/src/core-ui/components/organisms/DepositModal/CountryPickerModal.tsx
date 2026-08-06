'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FiChevronRight, FiSearch } from 'react-icons/fi';
import { AppModal } from '../../molecules/AppModal';
import { PressableButton } from '../../molecules/PressableButton';

interface CountryPickerModalProps {
  open: boolean;
  onOpenChange: () => void;
  /** Vuelve al selector de método. */
  onBack?: () => void;
  onSelect: (countryCode: CountryCode) => void;
  /**
   * Países operativos para el flujo que abrió el picker. El on-ramp y el
   * off-ramp no cubren los mismos: Brasil sólo tiene retiro (Pix), así
   * que aparece habilitado en el off-ramp y como "próximamente" en el depósito.
   */
  available?: CountryCode[];
}

export type CountryCode = 'AR' | 'BO' | 'BR' | 'MX' | 'CO' | 'PE';

interface Country {
  code: CountryCode;
  name: string;
  flag: string;
}

/** El orden fija primero los países operativos y después los que vienen. */
const COUNTRIES: Country[] = [
  { code: 'AR', name: 'Argentina', flag: '🇦🇷' },
  { code: 'BR', name: 'Brasil', flag: '🇧🇷' },
  { code: 'BO', name: 'Bolivia', flag: '🇧🇴' },
  { code: 'MX', name: 'México', flag: '🇲🇽' },
  { code: 'CO', name: 'Colombia', flag: '🇨🇴' },
  { code: 'PE', name: 'Perú', flag: '🇵🇪' },
];

/** Sin acentos y en minúsculas, para que "mexico" encuentre "México". */
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();

/**
 * Paso previo al on-ramp y al off-ramp: en qué país está el usuario. Define con
 * qué proveedor y moneda local se opera (Argentina/ARS con Anclap, Brasil/BRL
 * con los ramps de Pollar), así que se elige antes de arrancar el flujo de fiat.
 */
export function CountryPickerModal({
  open,
  onOpenChange,
  onBack,
  onSelect,
  available = ['AR'],
}: CountryPickerModalProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  const results = useMemo(() => {
    const q = normalize(query);
    const matches = q ? COUNTRIES.filter((c) => normalize(c.name).includes(q)) : COUNTRIES;
    // Los operativos arriba: cuáles lo son depende del flujo, así que el orden
    // se arma acá y no en la constante.
    return [...matches].sort(
      (a, b) => Number(available.includes(b.code)) - Number(available.includes(a.code)),
    );
  }, [query, available]);

  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      onBack={onBack}
      title={t('deposit.method.country.title', 'Select your country')}
      size="md"
      bodyClassName="flex flex-col gap-3 pb-4"
    >
      <div className="relative">
        <FiSearch className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('deposit.method.country.search', 'Search country')}
          aria-label={t('deposit.method.country.search', 'Search country')}
          className="w-full rounded-md border border-black border-b-2 bg-white h-12 pl-9 pr-3 text-black placeholder:text-gray-400 outline-none focus:border-b-3"
        />
      </div>

      <div className="flex flex-col gap-2">
        {results.map((country) =>
          available.includes(country.code) ? (
            <PressableButton variant="white" size="row"
              key={country.code}
              onClick={() => onSelect(country.code)}>
              <span className="text-2xl leading-none shrink-0">{country.flag}</span>
              <span className="flex-1 min-w-0 text-sm font-bold text-black">{country.name}</span>
              <FiChevronRight className="w-5 h-5 text-black shrink-0" />
            </PressableButton>
          ) : (
            <div
              key={country.code}
              aria-disabled
              className="w-full flex items-center gap-3 rounded-lg border border-black/20 bg-white/50 px-4 py-3 opacity-60"
            >
              <span className="text-2xl leading-none shrink-0 grayscale">{country.flag}</span>
              <span className="flex-1 min-w-0 text-sm font-bold text-gray-500">{country.name}</span>
              <span className="text-xs font-semibold text-gray-500 shrink-0">
                {t('deposit.method.country.comingSoon', 'Coming soon')}
              </span>
            </div>
          ),
        )}
        {results.length === 0 && (
          <p className="py-6 text-center text-sm text-gray-500">
            {t('deposit.method.country.noResults', 'No countries found')}
          </p>
        )}
      </div>
    </AppModal>
  );
}
