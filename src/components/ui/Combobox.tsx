'use client';

import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Command as CommandPrimitive, useCommandState } from 'cmdk';

import {
  useId,
  useState,
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';

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
  /** Which `ComboboxGroup.id` this option belongs to. Ignored unless the caller passes `groups`. */
  group?: string;
};

export type ComboboxGroup = { id: string; heading: string };

type ComboboxProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: ComboboxOption[];
  /**
   * Opt-in grouping (District's region headings). Omit for a flat list
   * (Category, which has no grouping concept) — rendering is entirely
   * different depending on whether this is present, not just a cosmetic
   * heading toggle.
   */
  groups?: ComboboxGroup[];
  searchPlaceholder: string;
  emptyText: string;
  /**
   * Native placeholder shown when nothing is selected and the field is
   * idle — CreateItemForm's category/district shape, where `''` is a
   * disabled placeholder, not a real option. Omitted when every reachable
   * value, including `''`, is a real option in `options` (FeedFilters'
   * shape, where a pinned option is always selected).
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
 * The trigger IS the editable field (Part 3 of the brief), so it must live
 * inside `<CommandPrimitive>` to read cmdk's own highlight-tracking state
 * via `useCommandState` for `aria-activedescendant` — the outer `Combobox`
 * component can't call that hook itself, since it renders `CommandPrimitive`
 * rather than being rendered inside it.
 *
 * This is a plain `<input>`, not cmdk's own `Command.Input`: that
 * component hardcodes `aria-expanded="true"` unconditionally (checked
 * against cmdk's source — the prop is set *after* the spread of passed-in
 * props, so it cannot be overridden) and its internal search state was
 * never actually load-bearing here anyway, since filtering already
 * happens externally (`shouldFilter={false}` above). A controlled native
 * input wired to this component's own state gives a real, dynamic
 * `aria-expanded` and full control over the ARIA combobox attributes the
 * brief asks for.
 */
function ComboboxAnchorInput({
  id,
  open,
  displayValue,
  nativePlaceholder,
  disabled,
  listboxId,
  onFocus,
  onClick,
  onChange,
  onKeyDown,
}: {
  id: string | undefined;
  open: boolean;
  displayValue: string;
  nativePlaceholder: string | undefined;
  disabled: boolean | undefined;
  listboxId: string;
  onFocus: (event: FocusEvent<HTMLInputElement>) => void;
  onClick: (event: MouseEvent<HTMLInputElement>) => void;
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
}) {
  const activeItemId = useCommandState((state) => state.selectedItemId);

  return (
    <input
      id={id}
      type="text"
      role="combobox"
      aria-expanded={open}
      aria-controls={listboxId}
      aria-autocomplete="list"
      aria-activedescendant={activeItemId || undefined}
      autoComplete="off"
      autoCorrect="off"
      spellCheck={false}
      disabled={disabled}
      value={displayValue}
      placeholder={nativePlaceholder}
      onFocus={onFocus}
      onClick={onClick}
      onChange={onChange}
      onKeyDown={onKeyDown}
      className="w-full rounded border border-neutral-300 bg-white py-2 pr-8 pl-3 text-sm text-neutral-900 outline-none focus:border-brand-strong focus:ring-1 focus:ring-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

/**
 * Type-directly-in-the-trigger dropdown for District and Category, which
 * outgrew plain Select at 32 (grouped by region) and ~10 options
 * respectively — Condition stays a plain Select (3 fixed values, nothing
 * to search). Built on Radix Popover (portal/positioning only — there is
 * no `Popover.Trigger` here, see below) + cmdk's `Command` for
 * keyboard-navigable, ARIA-wired list semantics.
 *
 * Styled to match Select.tsx's trigger/content exactly (border, focus
 * ring, brand-strong/brand-tint states) so the two don't read as
 * different dropdown languages.
 *
 * The field shows three different things depending on what's happening,
 * all from one `search: string | null` piece of state — `null` means
 * "not actively editing":
 * - Idle (`search === null`): the selected option's label, or the native
 *   `placeholder` HTML attribute if nothing is selected. This is also
 *   what it reverts to on Escape, blur, or an outside click with no
 *   selection made — nothing to "restore", since `search` merely being
 *   null makes the display fall back to whatever `value` already is.
 * - Focused, not yet typed (`search === null`, `open === true`): same
 *   display text as idle, but the browser has just `.select()`-ed it, so
 *   the very first keystroke replaces it outright rather than requiring
 *   the user to clear old text by hand.
 * - Typing (`search` is a real string): shows exactly that string and
 *   filters the list by it.
 */
export function Combobox({
  value,
  onValueChange,
  options,
  groups,
  searchPlaceholder,
  emptyText,
  placeholder,
  id,
  disabled,
}: ComboboxProps) {
  const listboxId = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState<string | null>(null);

  const selected = options.find((option) => option.value === value);
  const displayValue = search !== null ? search : (selected?.label ?? '');
  const nativePlaceholder = search !== null ? searchPlaceholder : (placeholder ?? searchPlaceholder);

  const query = (search ?? '').trim();
  const pinnedOptions = options.filter((option) => option.pinned);
  const nonPinnedOptions = options.filter((option) => !option.pinned);

  const groupSections = groups
    ?.map((group) => ({
      group,
      items: filterOptions(
        nonPinnedOptions.filter((option) => option.group === group.id),
        query,
      ),
    }))
    .filter((section) => section.items.length > 0);

  const flatItems = groups ? [] : filterOptions(nonPinnedOptions, query);
  const totalMatches = groups
    ? (groupSections?.reduce((sum, section) => sum + section.items.length, 0) ?? 0)
    : flatItems.length;
  const showEmpty = query.length > 0 && totalMatches === 0;

  function handleSelect(nextValue: string) {
    onValueChange(nextValue);
    setOpen(false);
    setSearch(null);
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) setSearch(null);
  }

  /**
   * Deferred a frame: selecting synchronously on focus gets silently undone
   * by the browser's own default mouseup behavior, which places the cursor
   * at the click point *after* focus already fired — a well-known
   * select-on-focus-via-mouse race. Running after that settles is what
   * actually leaves the text selected.
   */
  function openAndSelectAll(target: HTMLInputElement) {
    setOpen(true);
    requestAnimationFrame(() => target.select());
  }

  function handleFocus(event: FocusEvent<HTMLInputElement>) {
    openAndSelectAll(event.target);
  }

  /**
   * Selecting an option leaves the input focused (cmdk items are never
   * DOM-focused — see the aria-activedescendant note above), so a second
   * click afterward fires no new `focus` event at all and would otherwise
   * do nothing. Only handles the closed case; an already-open field just
   * lets the click place the cursor normally.
   */
  function handleClick(event: MouseEvent<HTMLInputElement>) {
    if (open) return;
    openAndSelectAll(event.currentTarget);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    setSearch(event.target.value);
    if (!open) setOpen(true);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter')) {
      setOpen(true);
    }
  }

  return (
    <CommandPrimitive shouldFilter={false} className="contents">
      <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <PopoverPrimitive.Anchor asChild>
          <div className="relative">
            <ComboboxAnchorInput
              id={id}
              open={open}
              displayValue={displayValue}
              nativePlaceholder={nativePlaceholder}
              disabled={disabled}
              listboxId={listboxId}
              onFocus={handleFocus}
              onClick={handleClick}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
            />
            <ChevronIcon className="pointer-events-none absolute top-1/2 right-2.5 h-4 w-4 -translate-y-1/2 text-neutral-500" />
          </div>
        </PopoverPrimitive.Anchor>

        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            sideOffset={4}
            align="start"
            // @radix-ui/react-popper (the primitive both this and Select sit
            // on) defaults `collisionPadding` to 0 — confirmed in
            // node_modules/@radix-ui/react-popper for the installed version.
            // Select never hits that default because @radix-ui/react-select's
            // own popper-position wrapper substitutes 10 first; Popover has
            // no such wrapper, so without this the computed
            // `--radix-popover-content-available-height` runs the content
            // flush to the viewport edge — on a grouped list long enough to
            // need the flip-to-top fallback (Category, at 41 rows), that
            // reads as the dropdown overlapping the page header with no
            // margin, not as a cleanly capped, scrollable box. Matches
            // Select's own effective value for the same "should behave
            // consistently" reason CLAUDE.md's one-pattern convention
            // already gives for reusing Combobox at all.
            collisionPadding={10}
            onOpenAutoFocus={(event) => event.preventDefault()}
            onCloseAutoFocus={(event) => event.preventDefault()}
            className="z-[100] flex max-h-[var(--radix-popover-content-available-height)] w-[var(--radix-popover-trigger-width)] flex-col overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg"
          >
            <div id={listboxId} className="min-h-0 overflow-y-auto p-1">
              <CommandPrimitive.List>
                {pinnedOptions.map((option) => (
                  <ComboboxItem
                    key={option.value}
                    option={option}
                    isSelected={option.value === value}
                    onSelect={handleSelect}
                  />
                ))}

                {groups
                  ? groupSections?.map(({ group, items }) => (
                      <CommandPrimitive.Group
                        key={group.id}
                        heading={
                          <span className="block px-3 pt-3 pb-1 text-xs font-semibold text-neutral-500">
                            {group.heading}
                          </span>
                        }
                      >
                        {items.map((option) => (
                          <ComboboxItem
                            key={option.value}
                            option={option}
                            isSelected={option.value === value}
                            onSelect={handleSelect}
                          />
                        ))}
                      </CommandPrimitive.Group>
                    ))
                  : flatItems.map((option) => (
                      <ComboboxItem
                        key={option.value}
                        option={option}
                        isSelected={option.value === value}
                        onSelect={handleSelect}
                      />
                    ))}

                {showEmpty && (
                  <p className="px-3 py-6 text-center text-sm text-neutral-500">{emptyText}</p>
                )}
              </CommandPrimitive.List>
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </CommandPrimitive>
  );
}
