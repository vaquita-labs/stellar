'use client';

/**
 * Control segmentado de la app: el track es una hairline clara que sostiene las
 * mitades y la pestaña SELECCIONADA es la que lleva el borde negro sólido y el
 * fondo primario. Sin padding en el track, así la activa llena su mitad de
 * borde a borde en vez de flotar dentro de un marco.
 */
export interface SegmentedTabsProps<T extends string> {
  value: T;
  onChange: (key: T) => void;
  tabs: ReadonlyArray<{ key: T; label: string }>;
  /** Texto para lectores de pantalla que describe qué se está eligiendo. */
  ariaLabel?: string;
  className?: string;
}

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  tabs,
  ariaLabel,
  className = '',
}: SegmentedTabsProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex w-full overflow-hidden rounded-md border border-black/15 bg-background ${className}`}
    >
      {tabs.map((tab) => {
        const active = value === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.key)}
            className={`flex-1 rounded-md py-3 text-xs font-extrabold uppercase tracking-wider transition-colors ${
              active ? 'border border-black bg-primary text-black' : 'text-default-500 hover:bg-black/5 hover:text-black'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
