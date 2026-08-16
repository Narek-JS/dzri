'use client';

import * as SelectPrimitive from '@radix-ui/react-select';

import type { ReactNode } from 'react';

/**
 * Radix reserves the literal empty string as "no value" — `Select.Item`
 * rejects it, and `Select.Value` is hardcoded to show `placeholder`
 * whenever the current value is `""` or `undefined`, full stop, regardless
 * of whether an item happens to have that value (checked against Radix's
 * own source: `shouldShowPlaceholder = (value) => value === "" || value
 * === undefined`). This app's filters predate that constraint and use `""`
 * as a real, always-selectable choice ("All districts" → an omitted URL
 * param), not an absence — so every value that crosses this component's
 * boundary is swapped for this sentinel and back, and no call site has to
 * know the substitution happened.
 */
const EMPTY_VALUE = '__dzri_empty__';

function toRadixValue(value: string): string {
  return value === '' ? EMPTY_VALUE : value;
}

function fromRadixValue(value: string): string {
  return value === EMPTY_VALUE ? '' : value;
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

type SelectVariant = 'field' | 'compact';

/**
 * 'field' (default) is the form-control shape: the trigger fills its
 * container and the dropdown is pinned to the trigger's own width via
 * Radix's `--radix-select-trigger-width` var — District/Category/
 * Condition/CreateItemForm all want this. 'compact' is for a small
 * icon-plus-label trigger (LanguageSwitcher) that must NOT stretch to
 * fill a flex row, and whose dropdown needs its own sane minimum rather
 * than being squeezed to the trigger's deliberately narrow width.
 */
const TRIGGER_WIDTH_CLASSES: Record<SelectVariant, string> = {
  field: 'w-full',
  compact: 'w-auto',
};

const CONTENT_WIDTH_CLASSES: Record<SelectVariant, string> = {
  field: 'w-[var(--radix-select-trigger-width)]',
  compact: 'min-w-40',
};

type SelectProps = {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
  /**
   * When set, `value === ''` means "nothing chosen yet" and Radix's own
   * placeholder is shown — this is CreateItemForm's category/district
   * shape, where `""` is a disabled placeholder, not a real option.
   *
   * When omitted, `""` is expected to be a real `Select.Item` the caller
   * renders itself (FeedFilters' "All districts" / "Any condition") — the
   * sentinel swap above makes that a normal, always-selected, re-openable
   * choice instead of triggering Radix's placeholder.
   */
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  'aria-label'?: string;
  variant?: SelectVariant;
  /** Rendered before the value inside the trigger, e.g. an icon. */
  triggerIcon?: ReactNode;
  /**
   * Overrides what the trigger shows for the current value. Without it,
   * the trigger auto-displays the selected `Select.Item`'s own children
   * (Radix teleports that item's text into the trigger). Pass this when
   * the trigger needs to show something other than the matching item's
   * label — LanguageSwitcher shows a short code in the trigger but the
   * full native name in the open list.
   */
  triggerLabel?: ReactNode;
};

function SelectRoot({
  value,
  onValueChange,
  children,
  placeholder,
  id,
  disabled,
  variant = 'field',
  triggerIcon,
  triggerLabel,
  ...triggerProps
}: SelectProps) {
  const hasPlaceholder = placeholder !== undefined;
  const radixValue = hasPlaceholder ? value || undefined : toRadixValue(value);

  function handleValueChange(next: string) {
    onValueChange(hasPlaceholder ? next : fromRadixValue(next));
  }

  return (
    <SelectPrimitive.Root value={radixValue} onValueChange={handleValueChange} disabled={disabled}>
      <SelectPrimitive.Trigger
        id={id}
        className={`flex items-center justify-between gap-2 rounded border border-neutral-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-strong focus:ring-1 focus:ring-brand-strong disabled:opacity-50 data-[placeholder]:text-neutral-400 ${TRIGGER_WIDTH_CLASSES[variant]}`}
        {...triggerProps}
      >
        <span className="flex items-center gap-1.5">
          {triggerIcon}
          <SelectPrimitive.Value placeholder={placeholder}>{triggerLabel}</SelectPrimitive.Value>
        </span>
        <SelectPrimitive.Icon>
          <ChevronIcon className="h-4 w-4 shrink-0 text-neutral-500" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className={`z-[100] max-h-[var(--radix-select-content-available-height)] overflow-hidden rounded-md border border-neutral-200 bg-white shadow-lg ${CONTENT_WIDTH_CLASSES[variant]}`}
        >
          <SelectPrimitive.ScrollUpButton className="flex items-center justify-center py-1 text-neutral-500">
            <ChevronIcon className="h-4 w-4 rotate-180" />
          </SelectPrimitive.ScrollUpButton>

          <SelectPrimitive.Viewport className="p-1">{children}</SelectPrimitive.Viewport>

          <SelectPrimitive.ScrollDownButton className="flex items-center justify-center py-1 text-neutral-500">
            <ChevronIcon className="h-4 w-4" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

function SelectItem({ value, children }: { value: string; children: ReactNode }) {
  return (
    <SelectPrimitive.Item
      value={toRadixValue(value)}
      className="relative flex cursor-pointer items-center rounded py-2 pr-3 pl-8 text-sm text-neutral-900 outline-none select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[highlighted]:bg-brand-tint data-[highlighted]:text-brand-strong"
    >
      <SelectPrimitive.ItemIndicator className="absolute left-2 inline-flex items-center text-brand-strong">
        <CheckIcon />
      </SelectPrimitive.ItemIndicator>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export const Select = Object.assign(SelectRoot, { Item: SelectItem });
