'use client';

import { Drawer } from 'vaul';

import type { ReactNode } from 'react';

/**
 * Fractions of viewport height vaul snaps to while dragging — roughly
 * half-height and near-full-height, per the brief. Order matters to vaul:
 * least-visible first. Dragging below the first (lowest) snap point closes
 * the sheet (vaul's default `dismissible` behavior), so there is no third
 * "closed" entry here.
 */
const SNAP_POINTS = [0.5, 0.9];

/**
 * Shared mobile bottom sheet wrapping vaul's `Drawer`, used by both the
 * hamburger nav menu (Header.tsx) and the filters panel (FeedFilters.tsx)
 * rather than each hand-rolling its own overlay/drag mechanics — this
 * project's one-pattern convention, same reasoning as the shared Combobox
 * and Select components.
 *
 * `handleOnly` restricts vaul's own drag-to-move/drag-to-dismiss gesture to
 * the pill `Drawer.Handle` rendered below, rather than the whole sheet
 * body — both callers can have scrollable content (the nav's link list,
 * the filters' Combobox/Select fields), and without this a touch-drag
 * meant to scroll that content would instead be read as a drag on the
 * sheet itself.
 *
 * `md:hidden` on the portal-rendered pieces (not the trigger, which callers
 * render themselves) keeps this entirely inert above the mobile breakpoint
 * — desktop callers never mount `open`, but this also guards against the
 * overlay/content briefly existing in the DOM during a close animation
 * while the viewport is resized past `md`.
 */
export function BottomSheet({
  open,
  onOpenChange,
  title,
  closeLabel,
  children,
  footer,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  closeLabel: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} snapPoints={SNAP_POINTS} handleOnly>
      <Drawer.Portal>
        {/* vaul's default `fadeFromIndex` (the last snap point, unset here
            so it falls back to that) fades this in only once the sheet
            reaches the taller snap point — no scrim at the half-height
            "peek" state. That's vaul's own default for a multi-snap-point
            drawer, left as-is per the brief rather than forcing a constant
            scrim to match the old single-height drawer. */}
        <Drawer.Overlay className="fixed inset-0 z-50 bg-neutral-900/50 md:hidden" />
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90vh] flex-col rounded-t-lg bg-white shadow-lg outline-none md:hidden">
          <Drawer.Handle className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-neutral-300" />

          <div className="flex items-center justify-between px-4 pt-3">
            <Drawer.Title className="text-base font-semibold text-neutral-900">
              {title}
            </Drawer.Title>
            <Drawer.Close
              type="button"
              aria-label={closeLabel}
              className="cursor-pointer text-2xl leading-none text-neutral-500"
            >
              ×
            </Drawer.Close>
          </div>

          {/* Safe-area padding lands on whichever section is visually last
              — the content area when there's no footer, the footer itself
              otherwise — so it's never applied twice. */}
          <div
            className={`flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 ${
              footer ? '' : 'pb-[max(1rem,env(safe-area-inset-bottom))]'
            }`}
          >
            {children}
          </div>

          {footer && (
            <div className="border-t border-neutral-200 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
