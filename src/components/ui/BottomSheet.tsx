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
 * The whole sheet body is a drag surface (see the `Drawer.Content` comment
 * below for why `handleOnly` isn't used for this instead) — both callers
 * can have interactive content (the nav's links, the filters'
 * Combobox/Select fields), and `data-vaul-no-drag` on those regions keeps
 * a tap there from being misread as a drag on the sheet.
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
    <Drawer.Root open={open} onOpenChange={onOpenChange} snapPoints={SNAP_POINTS} fadeFromIndex={0}>
      <Drawer.Portal>
        {/* `fadeFromIndex={0}`: vaul's own default is the LAST snap point,
            meaning the overlay only fades in once the sheet reaches the
            tallest one — no dimming at the lower, resting-open snap point.
            This app wants a dimmed backdrop as soon as the sheet opens, at
            either snap point, so the fade is anchored to the first
            (lowest) point instead: confirmed against
            node_modules/vaul/dist/index.mjs's `snapToPoint`, both snap
            points resolve to opacity `1` at rest with this setting. */}
        <Drawer.Overlay className="fixed inset-0 z-50 bg-neutral-900/50 md:hidden" />
        {/* `h-[90vh]`, a real height, not `max-h-[90vh]`: vaul's numeric
            `snapPoints` translate this element by a *fraction of the
            viewport* (e.g. 50% of screen height for the 0.5 point),
            assuming the element itself is already that tall — the reveal
            comes from sliding a fixed-height box up/down, not from the box
            growing to fit content. With only a max-height, this box sizes
            to its (short) content instead, so the translate for a shorter
            snap point pushed it entirely below the viewport: the sheet
            mounted with `data-state="open"` but was never actually
            visible on screen. A real height keeps the box tall regardless
            of content length; the inner content area below still scrolls
            via its own `overflow-y-auto` if content exceeds it. */}
        <Drawer.Content className="fixed inset-x-0 bottom-0 z-50 flex h-[90vh] flex-col rounded-t-lg bg-white shadow-lg outline-none md:hidden">
          {/* No `handleOnly` here: that restricted vaul's own drag-start to
              the small centered pill only, which is narrower than users
              expect ("grab the sheet from anywhere near the top"). Instead
              the whole `Drawer.Content` is a drag surface (vaul's
              default), and the specific regions that must stay
              click-only — the scrollable field list, the footer's
              buttons, and the close button — are opted out individually
              via `data-vaul-no-drag`, the attribute vaul's own `shouldDrag`
              checks (confirmed in node_modules/vaul/dist/index.mjs) before
              turning a press on/inside that element into a drag. */}
          <Drawer.Handle className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-neutral-300" />

          <div className="flex items-center justify-between px-4 pt-3">
            <Drawer.Title className="text-base font-semibold text-neutral-900">
              {title}
            </Drawer.Title>
            <Drawer.Close
              type="button"
              data-vaul-no-drag
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
            data-vaul-no-drag
            className={`flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 ${
              footer ? '' : 'pb-[max(1rem,env(safe-area-inset-bottom))]'
            }`}
          >
            {children}
          </div>

          {footer && (
            <div
              data-vaul-no-drag
              className="border-t border-neutral-200 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            >
              {footer}
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
