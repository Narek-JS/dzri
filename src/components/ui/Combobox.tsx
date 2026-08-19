'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import { Command as CommandPrimitive, useCommandState } from 'cmdk';
import { useTranslations } from 'next-intl';

import {
  useId,
  useRef,
  useState,
  useSyncExternalStore,
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

/**
 * Tailwind's `md` floor, as a media query — the same breakpoint
 * `BottomSheet`'s own `md:hidden` uses, so "the filters live in a bottom
 * sheet" and "the pickers are full-screen panels" are never true at
 * different widths.
 */
const MOBILE_MEDIA_QUERY = '(max-width: 767.98px)';

function subscribeToMobileMedia(onChange: () => void) {
  const query = window.matchMedia(MOBILE_MEDIA_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

/**
 * `useSyncExternalStore` rather than `useEffect` + `useState`: the server
 * snapshot is a literal `false`, so SSR and the hydrating client render
 * agree on the desktop branch and React swaps to the mobile branch in the
 * commit right after — no hydration mismatch, and nothing visibly moves,
 * since both branches render the same-sized closed field.
 */
function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribeToMobileMedia,
    () => window.matchMedia(MOBILE_MEDIA_QUERY).matches,
    () => false,
  );
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

function CloseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" className="h-5 w-5">
      <path
        d="M5.5 5.5L14.5 14.5M14.5 5.5L5.5 14.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
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
   * The field's own visible label, repeated as the title of the mobile
   * picker panel — that panel covers the screen, so the label the user
   * just tapped is no longer on it and has to be restated. Desktop never
   * renders this: its popover hangs directly off a label that stays put.
   */
  label: string;
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
   * Shown when nothing is selected and the field is idle —
   * CreateItemForm's category/district shape, where `''` is a disabled
   * placeholder, not a real option. Omitted when every reachable value,
   * including `''`, is a real option in `options` (FeedFilters' shape,
   * where a pinned option is always selected).
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

type ComboboxSections = {
  pinned: ComboboxOption[];
  /** Present only when the caller passed `groups`; `flat` carries the list otherwise. */
  grouped?: { group: ComboboxGroup; items: ComboboxOption[] }[];
  flat: ComboboxOption[];
  showEmpty: boolean;
};

/**
 * The one place the option list is partitioned and filtered, shared by
 * both presentations below so a search that matches on desktop matches
 * exactly the same rows on mobile.
 */
function buildSections(
  options: ComboboxOption[],
  groups: ComboboxGroup[] | undefined,
  search: string,
): ComboboxSections {
  const query = search.trim();
  const pinned = options.filter((option) => option.pinned);
  const rest = options.filter((option) => !option.pinned);

  const grouped = groups
    ?.map((group) => ({
      group,
      items: filterOptions(
        rest.filter((option) => option.group === group.id),
        query,
      ),
    }))
    .filter((section) => section.items.length > 0);

  const flat = groups ? [] : filterOptions(rest, query);
  const totalMatches = grouped
    ? grouped.reduce((sum, section) => sum + section.items.length, 0)
    : flat.length;

  return { pinned, grouped, flat, showEmpty: query.length > 0 && totalMatches === 0 };
}

function ComboboxItem({
  option,
  isSelected,
  itemClassName,
  onSelect,
}: {
  option: ComboboxOption;
  isSelected: boolean;
  itemClassName: string;
  onSelect: (value: string) => void;
}) {
  return (
    <CommandPrimitive.Item
      value={toCmdkValue(option.value)}
      onSelect={() => onSelect(option.value)}
      className={`relative flex cursor-pointer items-center rounded pr-3 pl-8 outline-none select-none data-[selected=true]:bg-brand-tint data-[selected=true]:text-brand-strong ${itemClassName}`}
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
 * `itemClassName` is the one thing the two presentations genuinely differ
 * on inside the list: mobile rows need a real thumb target (`min-h-11`,
 * 44px) at body text size, which would read as loose and over-padded in a
 * popover being driven by a mouse.
 */
function ComboboxOptionList({
  sections,
  value,
  emptyText,
  listboxId,
  itemClassName,
  onSelect,
}: {
  sections: ComboboxSections;
  value: string;
  emptyText: string;
  listboxId: string;
  itemClassName: string;
  onSelect: (value: string) => void;
}) {
  return (
    <CommandPrimitive.List id={listboxId}>
      {sections.pinned.map((option) => (
        <ComboboxItem
          key={option.value}
          option={option}
          isSelected={option.value === value}
          itemClassName={itemClassName}
          onSelect={onSelect}
        />
      ))}

      {sections.grouped
        ? sections.grouped.map(({ group, items }) => (
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
                  itemClassName={itemClassName}
                  onSelect={onSelect}
                />
              ))}
            </CommandPrimitive.Group>
          ))
        : sections.flat.map((option) => (
            <ComboboxItem
              key={option.value}
              option={option}
              isSelected={option.value === value}
              itemClassName={itemClassName}
              onSelect={onSelect}
            />
          ))}

      {sections.showEmpty && (
        <p className="px-3 py-6 text-center text-sm text-neutral-500">{emptyText}</p>
      )}
    </CommandPrimitive.List>
  );
}

/**
 * Attributes that keep a browser's own autofill/saved-value dropdown off
 * a field that is not a form field at all — it is a filter box over a
 * list this component already holds in memory. Chrome in particular reads
 * a field's label and placeholder as heuristics, and "District" /
 * "Region" / "Category" all look like an address form to it, so the field
 * would cover the real options with the user's saved street address.
 * `autoComplete="off"` alone does not stop those heuristics; the rest are
 * the documented opt-outs of the mainstream password managers.
 */
const NO_AUTOFILL_PROPS = {
  autoComplete: 'off',
  autoCorrect: 'off',
  autoCapitalize: 'none',
  spellCheck: false,
  'data-1p-ignore': true,
  'data-lpignore': 'true',
  'data-form-type': 'other',
} as const;

/**
 * On desktop the trigger IS the editable field, so it must live inside
 * `<CommandPrimitive>` to read cmdk's own highlight-tracking state via
 * `useCommandState` for `aria-activedescendant` — `DesktopCombobox` can't
 * call that hook itself, since it renders `CommandPrimitive` rather than
 * being rendered inside it.
 *
 * This is a plain `<input>`, not cmdk's own `Command.Input`: that
 * component hardcodes `aria-expanded="true"` unconditionally (checked
 * against cmdk's source — the prop is set *after* the spread of passed-in
 * props, so it cannot be overridden) and its internal search state was
 * never actually load-bearing here anyway, since filtering already
 * happens externally (`shouldFilter={false}` below). A controlled native
 * input wired to this component's own state gives a real, dynamic
 * `aria-expanded` and full control over the ARIA combobox attributes.
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
      disabled={disabled}
      value={displayValue}
      placeholder={nativePlaceholder}
      onFocus={onFocus}
      onClick={onClick}
      onChange={onChange}
      onKeyDown={onKeyDown}
      {...NO_AUTOFILL_PROPS}
      className="w-full rounded border border-neutral-300 bg-white py-2 pr-8 pl-3 text-sm text-neutral-900 outline-none focus:border-brand-strong focus:ring-1 focus:ring-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

/**
 * Desktop presentation: type directly into the trigger, options in a
 * Radix Popover pinned under it. Built on Radix Popover (portal and
 * positioning only — there is no `Popover.Trigger` here, see
 * `handleInteractOutside`) plus cmdk's `Command` for keyboard-navigable,
 * ARIA-wired list semantics.
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
function DesktopCombobox({
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
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState<string | null>(null);

  const selected = options.find((option) => option.value === value);
  const displayValue = search !== null ? search : (selected?.label ?? '');
  const nativePlaceholder =
    search !== null ? searchPlaceholder : (placeholder ?? searchPlaceholder);
  const sections = buildSections(options, groups, search ?? '');

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

  /**
   * There is no real `Popover.Trigger` here — the trigger is the input,
   * and a `Trigger` would toggle the popover shut again on every click
   * into the text. Radix only ever exempts an actual `Trigger` element
   * from its own outside-interaction dismissal, though, so with a bare
   * `Anchor` it has no way to know a pointerdown/focus landing back on
   * the input is expected rather than an outside interaction. On a single
   * synchronous mouse click this never surfaces (the focus that opens the
   * popover and the click that would be "outside" are the same event),
   * but a pen or touch input spans a wider timeline (pointerdown,
   * touchstart, pointerup, touchend, then a *separately dispatched*
   * compatibility mousedown/pointerdown once `Popover.Content` has
   * already mounted), and that later compatibility event can be picked up
   * as a genuine outside interaction, closing the popover ~20ms after it
   * opened. Kept even though phones now take the `MobileCombobox` branch
   * instead: a touchscreen laptop at >= `md` is the same timeline.
   */
  function handleInteractOutside(
    event: CustomEvent<{ originalEvent: PointerEvent | globalThis.FocusEvent }>,
  ) {
    const target = event.detail.originalEvent.target;
    if (target instanceof Node && anchorRef.current?.contains(target)) {
      event.preventDefault();
    }
  }

  return (
    <CommandPrimitive shouldFilter={false} className="contents">
      <PopoverPrimitive.Root open={open} onOpenChange={handleOpenChange}>
        <PopoverPrimitive.Anchor asChild>
          <div ref={anchorRef} className="relative">
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
            onInteractOutside={handleInteractOutside}
            className="z-[100] flex max-h-[min(520px,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] flex-col overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg"
          >
            <div className="min-h-0 overflow-y-auto p-1">
              <ComboboxOptionList
                sections={sections}
                value={value}
                emptyText={emptyText}
                listboxId={listboxId}
                itemClassName="py-2 text-sm text-neutral-900"
                onSelect={handleSelect}
              />
            </div>
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </CommandPrimitive>
  );
}

/** Split out for the same "`useCommandState` needs a `Command` ancestor" reason as `ComboboxAnchorInput`. */
function MobileSearchInput({
  search,
  placeholder,
  listboxId,
  onChange,
}: {
  search: string;
  placeholder: string;
  listboxId: string;
  onChange: (next: string) => void;
}) {
  const activeItemId = useCommandState((state) => state.selectedItemId);

  return (
    <input
      type="text"
      role="combobox"
      aria-expanded
      aria-controls={listboxId}
      aria-autocomplete="list"
      aria-activedescendant={activeItemId || undefined}
      aria-label={placeholder}
      enterKeyHint="search"
      value={search}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      {...NO_AUTOFILL_PROPS}
      // `text-base`, not the `text-sm` its desktop counterpart uses: iOS
      // Safari zooms the whole page in on focusing any input below 16px,
      // and never zooms back out.
      className="w-full rounded border border-neutral-300 bg-white px-3 py-2.5 text-base text-neutral-900 outline-none focus:border-brand-strong focus:ring-1 focus:ring-brand-strong"
    />
  );
}

/**
 * Mobile presentation: the field is a button showing the current
 * selection, and tapping it opens the options as a full-screen modal
 * panel with the search box inside the panel.
 *
 * Why not just reuse the desktop popover at this width:
 *
 * 1. **The list could not be scrolled at all inside the filters sheet.**
 *    A popover is portalled to `document.body`, and the mobile filters
 *    live in `BottomSheet` — vaul over a Radix modal dialog, whose
 *    `Overlay` wraps the page in `react-remove-scroll` with the drawer
 *    content as its only registered "shard". That library installs a
 *    non-passive document `touchmove` listener that `preventDefault()`s
 *    every touch scroll whose target is neither inside the lock nor
 *    inside a shard (confirmed in
 *    node_modules/react-remove-scroll/dist/es2015/SideEffect.js, the
 *    `shouldStop = shardNodes.length > 0 ? … : !noIsolation` branch of
 *    `shouldPrevent`) — and a body-portalled popover is exactly that, so
 *    every swipe over the options was swallowed. Only the *last* lock on
 *    that module's `lockStack` is active, though, so a nested modal that
 *    installs its own lock takes over and scrolls normally. A Radix
 *    `Dialog` does install one; a `Popover` only does when `modal`, and
 *    `modal` also traps focus inside the content — where the desktop
 *    branch's trigger input, being the anchor rather than a child, is
 *    not. Hence a real dialog here.
 * 2. **The trigger being a text input was the wrong control for a
 *    thumb.** Tapping the field raised the software keyboard over the
 *    very list it had just opened, and the browser offered its own
 *    autofill suggestions on top of the options (see
 *    `NO_AUTOFILL_PROPS`). A button trigger has neither problem, and the
 *    search box inside the panel only takes focus if the user actually
 *    taps it — see `onOpenAutoFocus`.
 */
function MobileCombobox({
  value,
  onValueChange,
  options,
  label,
  groups,
  searchPlaceholder,
  emptyText,
  placeholder,
  id,
  disabled,
}: ComboboxProps) {
  const t = useTranslations();
  const listboxId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selected = options.find((option) => option.value === value);
  const sections = buildSections(options, groups, search);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    // Reset in both directions: a panel reopened after a cancel should
    // start from the full list, not from whatever was half-typed before.
    setSearch('');
  }

  function handleSelect(nextValue: string) {
    onValueChange(nextValue);
    handleOpenChange(false);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      {/* A real `Dialog.Trigger`, unlike the desktop branch's bare
          `Popover.Anchor`: Radix exempts its own trigger from the
          outside-interaction dismissal, and restores focus to it on
          close. `<label htmlFor>` works against a button, so the field's
          label still both labels and activates this. */}
      <DialogPrimitive.Trigger
        id={id}
        disabled={disabled}
        className="flex w-full cursor-pointer items-center justify-between gap-2 rounded border border-neutral-300 bg-white px-3 py-2 text-left text-sm outline-none focus:border-brand-strong focus:ring-1 focus:ring-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={`truncate ${selected ? 'text-neutral-900' : 'text-neutral-400'}`}>
          {selected?.label ?? placeholder ?? searchPlaceholder}
        </span>
        <ChevronIcon className="h-4 w-4 shrink-0 text-neutral-500" />
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        {/* Above `BottomSheet`'s own z-50 overlay, content and pinned
            footer: this panel is opened from inside that sheet and has to
            cover all three, or the sheet's Apply bar sits on top of the
            options. */}
        <DialogPrimitive.Overlay className="fixed inset-0 z-[110] bg-neutral-900/50" />
        <DialogPrimitive.Content
          ref={contentRef}
          // Radix logs a warning for a dialog with no description. This
          // one is a titled picker whose entire body is the labelled
          // control it describes, so there is nothing left to say.
          aria-describedby={undefined}
          // Radix's default would focus the first tabbable child — the
          // search box — raising the software keyboard over the list
          // before the user has even seen it, which is half of what made
          // the old input-triggered version feel wrong. Focusing the
          // panel itself (Radix already gives `Content` `tabIndex={-1}`)
          // satisfies the focus trap without a keyboard, and Tab still
          // reaches the search box first for anyone driving this from a
          // physical keyboard.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            contentRef.current?.focus();
          }}
          className="fixed inset-0 z-[110] flex flex-col bg-white outline-none"
        >
          <CommandPrimitive shouldFilter={false} className="flex min-h-0 flex-1 flex-col">
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-200 py-2 pt-[max(0.5rem,env(safe-area-inset-top))] pr-2 pl-4">
              <DialogPrimitive.Title className="truncate text-base font-semibold text-neutral-900">
                {label}
              </DialogPrimitive.Title>
              <DialogPrimitive.Close className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded text-neutral-500 outline-none focus-visible:ring-1 focus-visible:ring-brand-strong">
                <CloseIcon />
                <span className="sr-only">{t('combobox.close')}</span>
              </DialogPrimitive.Close>
            </div>

            <div className="shrink-0 px-4 py-3">
              <MobileSearchInput
                search={search}
                placeholder={searchPlaceholder}
                listboxId={listboxId}
                onChange={setSearch}
              />
            </div>

            {/* `overscroll-contain` stops a fling that reaches either end
                of this list from chaining out into whatever is underneath
                — on the feed that is the sheet, and then the page. */}
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
              <ComboboxOptionList
                sections={sections}
                value={value}
                emptyText={emptyText}
                listboxId={listboxId}
                itemClassName="min-h-11 py-2.5 text-base text-neutral-900"
                onSelect={handleSelect}
              />
            </div>
          </CommandPrimitive>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/**
 * Searchable dropdown for District and Category, which outgrew plain
 * Select at 32 (grouped by region) and ~10 options respectively —
 * Condition stays a plain Select (3 fixed values, nothing to search).
 *
 * Two presentations, chosen by viewport at Tailwind's `md` breakpoint,
 * because the interaction that is right under a mouse is actively broken
 * under a thumb — `MobileCombobox` documents exactly what broke.
 * Everything except the presentation is shared: the same options, the
 * same substring filter, the same cmdk list and ARIA semantics.
 */
export function Combobox(props: ComboboxProps) {
  const isMobile = useIsMobile();
  return isMobile ? <MobileCombobox {...props} /> : <DesktopCombobox {...props} />;
}
