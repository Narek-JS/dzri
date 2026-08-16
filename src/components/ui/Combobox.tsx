'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Command as CommandPrimitive } from 'cmdk';

import { useState, type ReactNode } from 'react';

/**
 * cmdk tracks which item is keyboard/pointer-highlighted with a truthy
 * check (`state.value && state.value === itemValue`), so an item whose
 * value is the empty string can never register as highlighted — arrow
 * keys silently no-op on it and it never gets the highlighted style, even
 * though it renders first and cmdk auto-selects the first item on mount.
 * This app's "All districts" / "All categories" option uses `''` as a
 * real, always-selectable value (the same convention Select.tsx's
 * EMPTY_VALUE documents, hitting a different library's landmine here), so
 * the value handed to cmdk's own `Item` is swapped for a non-empty
 * sentinel. Nothing needs to swap it back — `onSelect` below closes over
 * the option's real `value` directly rather than reading cmdk's callback
 * argument, so the sentinel never escapes this file.
 */
const EMPTY_VALUE = '__dzri_combobox_empty__';

function toCmdkValue(value: string): string {
  return value === '' ? EMPTY_VALUE : value;
}

function ChevronIcon({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className={className}>
      <path
        d="M5 7.5L10 12.5L15 7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-4 w-4">
      <path
        d="M4 10.5L8 14.5L16 6"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export type ComboboxOption = {
  value: string;
  label: string;
  /**
   * Pinned to the top of the list and shown regardless of the search
   * text — the "All districts" / "All categories" option. Not filtered
   * against the search box at all, and never hidden by it.
   */
  pinned?: boolean;
};

type ComboboxProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  searchPlaceholder: string;
  emptyText: string;
  /**
   * Shown in the trigger when `value` matches no option — CreateItemForm's
   * category/district shape, where there is no pinned "all" choice and
   * `''` means nothing picked yet. Omit it when every reachable value,
   * including `''`, is a real option in `options` (FeedFilters' shape).
   */
  placeholder?: string;
  id?: string;
  disabled?: boolean;
};

/**
 * Filtering is done here, not handed to cmdk's built-in scorer
 * (`shouldFilter={false}` below): cmdk's default filter treats a falsy
 * item value — including the pinned option's `''` — as an automatic
 * non-match once there is a search term, and its DOM-reordering-by-score
 * would un-pin that option from the top the moment someone types. Plain
 * substring matching against whichever locale's label the caller already
 * resolved is also the correct behavior here — this is a 10-40 row list
 * of place/category names, not a command palette that benefits from fuzzy
 * scoring.
 */
function filterOptions(options: ComboboxOption[], search: string): ComboboxOption[] {
  const needle = search.trim().toLowerCase();
  if (!needle) return options;
  return options.filter((option) => option.label.toLowerCase().includes(needle));
}

function ComboboxItem({
  option,
  isSelected,
  onSelect,
}: {
  option: ComboboxOption;
  isSelected: boolean;
  onSelect: (value: string) => void;
}) {
  return (
    <CommandPrimitive.Item
      value={toCmdkValue(option.value)}
      onSelect={() => onSelect(option.value)}
      className="relative flex cursor-pointer items-center rounded py-2 pr-3 pl-8 text-sm text-neutral-900 outline-none select-none data-[selected=true]:bg-brand-tint data-[selected=true]:text-brand-strong"
    >
      {isSelected && (
        <span className="absolute left-2 inline-flex items-center text-brand-strong">
          <CheckIcon />
        </span>
      )}
      {option.label}
    </CommandPrimitive.Item>
  );
}

/**
 * Type-to-filter dropdown for District and Category, which outgrew plain
 * Select at 32 and ~10 options respectively — Condition stays a plain
 * Select (3 fixed values, nothing to search). Built on Radix Popover +
 * cmdk's Command rather than Radix Select, which has no text-filtering
 * story of its own.
 *
 * Styled to match Select.tsx's trigger/content exactly (border, focus
 * ring, brand-strong/brand-tint states) so the two don't read as
 * different dropdown languages.
 */
export function Combobox({
  value,
  onValueChange,
  options,
  searchPlaceholder,
  emptyText,
  placeholder,
  id,
  disabled,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = options.find((option) => option.value === value);
  const isPlaceholder = !selected && placeholder !== undefined;

  const pinnedOptions = options.filter((option) => option.pinned);
  const searchableOptions = options.filter((option) => !option.pinned);
  const filteredOptions = filterOptions(searchableOptions, search);

  function handleSelect(nextValue: string) {
    onValueChange(nextValue);
    setOpen(false);
    setSearch('');
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setSearch('');
  }

  const triggerLabel: ReactNode = selected ? selected.label : (placeholder ?? '');

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <PopoverPrimitive.Trigger
        id={id}
        type="button"
        disabled={disabled}
        className={`flex w-full items-center justify-between gap-2 rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-strong focus:ring-1 focus:ring-brand-strong disabled:opacity-50 ${isPlaceholder ? 'text-neutral-400' : ''}`}
      >
        <span className="truncate">{triggerLabel}</span>
        <ChevronIcon className="h-4 w-4 shrink-0 text-neutral-500" />
      </PopoverPrimitive.Trigger>

      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          sideOffset={4}
          align="start"
          className="z-[100] flex max-h-[var(--radix-popover-content-available-height)] w-[var(--radix-popover-trigger-width)] flex-col overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg"
        >
          <CommandPrimitive shouldFilter={false} className="flex min-h-0 flex-col">
            <CommandPrimitive.Input
              autoFocus
              value={search}
              onValueChange={setSearch}
              placeholder={searchPlaceholder}
              className="border-b border-neutral-200 px-3 py-2 text-sm outline-none placeholder:text-neutral-400"
            />
            <CommandPrimitive.List className="min-h-0 overflow-y-auto p-1">
              {pinnedOptions.map((option) => (
                <ComboboxItem
                  key={option.value}
                  option={option}
                  isSelected={option.value === value}
                  onSelect={handleSelect}
                />
              ))}
              {filteredOptions.map((option) => (
                <ComboboxItem
                  key={option.value}
                  option={option}
                  isSelected={option.value === value}
                  onSelect={handleSelect}
                />
              ))}
              {search.trim() && filteredOptions.length === 0 && (
                <p className="px-3 py-6 text-center text-sm text-neutral-500">{emptyText}</p>
              )}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
