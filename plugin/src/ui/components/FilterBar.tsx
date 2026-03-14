/**
 * FilterBar — segmented filter control.
 */

import type { FilterMode } from '@shared/styleTypes';

const FILTERS: { mode: FilterMode; label: string }[] = [
  { mode: 'all', label: 'All' },
  { mode: 'drifted', label: 'Drifted' },
  { mode: 'clean', label: 'Clean' },
  { mode: 'unmapped', label: 'Unmapped' },
];

interface FilterBarProps {
  current: FilterMode;
  onChange: (mode: FilterMode) => void;
}

export function FilterBar({ current, onChange }: FilterBarProps) {
  return (
    <div className="filter-bar">
      <div className="segmented filter-segmented">
        {FILTERS.map((f) => (
          <button
            key={f.mode}
            className={`seg-btn ${current === f.mode ? 'active' : ''}`}
            onClick={() => onChange(f.mode)}
          >
            {f.label}
          </button>
        ))}
      </div>
    </div>
  );
}
