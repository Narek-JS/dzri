'use client';

import { Drawer } from 'vaul';

import type { ReactNode } from 'react';

/**
 * Default fractions of viewport height vaul snaps to while dragging —
 * roughly half-height and near-full-height, per the brief. Order matters
 * to vaul: least-visible first. Dragging below the first (lowest) snap
 * point closes the sheet (vaul's default `dismissible` behavior), so
 * there is no third "closed" entry here.
 *
 * Overridable via the `snapPoints` prop: Header.tsx's nav menu (a couple
 * of short links plus a Post button) fits this default fine, but
 * FeedFilters' three fields plus its pinned footer need more of the
 * lower point to all be visible without scrolling — passing a taller
 * value there rather than raising this shared default keeps the nav menu
 * from picking up dead space it doesn't need.
 */
const DEFAULT_SNAP_POINTS = [0.5, 0.9];

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
 * `footer`, when passed, renders as its own `position: fixed` bar pinned
 * to the actual viewport bottom — a sibling of `Drawer.Content`, not a
 * child of it. vaul's snap points translate `Drawer.Content` as one rigid
 * `h-[90vh]` block anchored via `bottom: 0`; at any snap point short of
 * "fully open" (both of this app's two points qualify — even the taller
 * one is only 90%) that translate pushes the block's own bottom edge, and
 * anything sitting at the bottom of it via flex, below the viewport's
 * bottom edge. A `footer` living inside that block — e.g. FeedFilters'
 * persistent Clear all/Apply — would only ever be reachable by dragging
 * to a snap point tall enough to happen to include it, not "always
 * visible" as the prop implies. Pinning it outside the translated block
 * instead keeps it flush with the screen regardless of snap position.
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
  children,
  footer,
  snapPoints = DEFAULT_SNAP_POINTS,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  snapPoints?: (number | string)[];
}) {
  /**
   * Radix Dialog's own modal behavior (vaul's `Drawer.Content` is a
   * `Dialog.Content`) calls the `aria-hidden` package's `hideOthers()`
   * once the dialog opens — it walks every sibling of `Content` up to
   * `document.body` and marks each `aria-hidden="true"` (and, via
   * `document.body`'s own `pointer-events: none`, unclickable — see the
   * `pointer-events-auto` override below), so background content is
   * invisible to assistive tech and the mouse while the modal is open.
   * `footer` is deliberately rendered as a *sibling* of `Content`, not a
   * descendant of it (see the comment above) — from `hideOthers()`'s own
   * point of view that makes it indistinguishable from actual background
   * page content, so it gets hidden too.
   *
   * A callback ref, not `useRef` + `useEffect`: `hideOthers()` fires from
   * a `useEffect` inside Radix's own `Dialog.Content` (confirmed in
   * node_modules/@radix-ui/react-dialog/dist/index.mjs), which is wrapped
   * in Radix's `Presence` — an internal state machine that mounts on its
   * own schedule, not necessarily the same commit as this plain
   * `open && footer` conditional. Confirmed by logging: at the point a
   * sibling `useEffect` here ran, `footerRef.current` was still `null` —
   * this div hadn't actually attached yet despite `open` already being
   * `true` in props, so a `useRef`-based effect has nothing to attach a
   * `MutationObserver` to at a reliable point. A callback ref instead
   * fires exactly when React attaches (or detaches) the real DOM node,
   * with no such gap to reason about — attach the observer right there.
   */
  function attachFooterRef(node: HTMLDivElement | null) {
    if (!node) return;
    // A local `const` re-binding, not `node` itself: TypeScript doesn't
    // carry the null-narrowing above into a nested function declaration's
    // closure over the outer parameter, so referencing `node` directly
    // inside `unhide` would need a non-null assertion (forbidden by this
    // project's lint config) to satisfy the type checker.
    const element = node;
    function unhide() {
      element.removeAttribute('aria-hidden');
      element.removeAttribute('data-aria-hidden');
    }
    unhide();
    const observer = new MutationObserver(unhide);
    observer.observe(element, { attributes: true, attributeFilter: ['aria-hidden', 'data-aria-hidden'] });
    return () => observer.disconnect();
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange} snapPoints={snapPoints} fadeFromIndex={0}>
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
              default), and the scrollable field list — the one region
              that must stay click-only — opts out individually via
              `data-vaul-no-drag`, the attribute vaul's own `shouldDrag`
              checks (confirmed in node_modules/vaul/dist/index.mjs)
              before turning a press on/inside that element into a drag.
              `footer` doesn't need this: it's not inside `Drawer.Content`
              at all, see the comment above. There's no explicit close
              button — dismiss is drag-down past the lowest snap point,
              per vaul's own `dismissible` default. */}
          <Drawer.Handle className="mx-auto mt-3 h-1.5 w-10 shrink-0 rounded-full bg-neutral-300" />

          <div className="px-4 pt-3">
            <Drawer.Title className="text-base font-semibold text-neutral-900">
              {title}
            </Drawer.Title>
          </div>

          {/* Safe-area padding lands on whichever section is visually
              last. With no footer that's this content area; with a
              footer, the footer (its own fixed bar below) takes the
              safe-area padding instead, and this area gets a flat, more
              generous `pb-28` so its last scrolled-to item clears the
              footer bar rather than sitting behind it. */}
          <div
            data-vaul-no-drag
            className={`flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 ${
              footer ? 'pb-28' : 'pb-[max(1rem,env(safe-area-inset-bottom))]'
            }`}
          >
            {children}
          </div>
        </Drawer.Content>

        {open && footer && (
          <div
            ref={attachFooterRef}
            className="pointer-events-auto fixed inset-x-0 bottom-0 z-50 border-t border-neutral-200 bg-white px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:hidden"
          >
            {footer}
          </div>
        )}
      </Drawer.Portal>
    </Drawer.Root>
  );
}
