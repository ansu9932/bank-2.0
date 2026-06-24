import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RiSearchLine, RiCheckLine, RiArrowDownSLine } from 'react-icons/ri';
import { COUNTRIES } from '../../data/countries';

/**
 * Searchable country picker for the account-opening flow.
 *
 * Renders a button showing the current selection; clicking opens a popover with
 * a search box that filters the supported countries by name. Choosing a country
 * calls `onSelect(countryName)`.
 *
 * @param {object}   props
 * @param {string}   props.value     Currently selected country name.
 * @param {Function} props.onSelect  Called with the chosen country name.
 * @param {boolean}  [props.error]   Apply an error ring when true.
 */
export default function CountrySelect({ value, onSelect, error = false }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  const selected = COUNTRIES.find((c) => c.name === value) || null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q),
    );
  }, [query]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return undefined;
    const onClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  // Focus the search box when the popover opens.
  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
  }, [open]);

  const choose = (name) => {
    onSelect(name);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`input-field flex items-center justify-between w-full text-left ${
          error ? '!border-brand-500 focus:!border-brand-500' : ''
        }`}
      >
        <span className="flex items-center gap-2">
          {selected ? (
            <>
              <span className="text-lg leading-none">{selected.flag}</span>
              <span className="text-white">{selected.name}</span>
            </>
          ) : (
            <span className="text-dark-400">Select your country</span>
          )}
        </span>
        <RiArrowDownSLine className={`text-dark-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute z-30 mt-2 w-full rounded-xl border border-white/[0.1] bg-dark-800 shadow-2xl overflow-hidden"
          style={{ background: '#16161f' }}
        >
          <div className="p-2 border-b border-white/[0.06]">
            <div className="relative">
              <RiSearchLine className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-400 text-sm" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search country…"
                className="w-full bg-dark-700/60 text-white text-sm rounded-lg pl-9 pr-3 py-2 outline-none border border-white/[0.06] focus:border-brand-500/60"
              />
            </div>
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-4 py-3 text-dark-400 text-sm text-center">No countries found</li>
            ) : (
              filtered.map((c) => {
                const isSel = c.name === value;
                return (
                  <li key={c.code}>
                    <button
                      type="button"
                      onClick={() => choose(c.name)}
                      className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 text-sm transition-colors ${
                        isSel ? 'bg-brand-500/15 text-white' : 'text-dark-200 hover:bg-white/[0.05]'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span className="text-lg leading-none">{c.flag}</span>
                        <span>{c.name}</span>
                        <span className="text-dark-500 text-xs">{c.dialCode}</span>
                      </span>
                      {isSel && <RiCheckLine className="text-brand-400" />}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
