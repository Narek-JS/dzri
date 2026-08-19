'use client';

import { useEffect } from 'react';

/**
 * The half of "no zoom" that the viewport meta tag cannot do on an iPhone.
 *
 * Safari on iOS has ignored `user-scalable=no` since iOS 10, and treats
 * `maximum-scale` as advisory for a *user-initiated* pinch — both were
 * deliberately overridden for accessibility. What it still honours is
 * `maximum-scale=1` for the automatic zoom-on-focus of a small input, which
 * is why the `viewport` export in [locale]/layout.tsx is still worth having;
 * it just does not stop two fingers on the glass.
 *
 * What does stop them is WebKit's non-standard gesture events. They fire only
 * for multi-touch scale/rotate, ahead of the browser's own page zoom, and
 * cancelling `gesturestart` cancels the zoom with them. They are WebKit-only,
 * so on Chrome/Firefox for Android nothing here runs and `user-scalable=no`
 * in the meta tag — which those engines do respect — carries it instead.
 *
 * Not done with a non-passive `touchmove` listener that filters on
 * `touches.length > 1`, which is the other recipe for this: a non-passive
 * touch listener on `document` opts the whole page out of the compositor's
 * fast-path scrolling, and the feed is a long scrolling list. The gesture
 * events cost nothing until two fingers actually land.
 *
 * Double-tap-to-zoom is not handled here — that is `touch-action:
 * manipulation` on `html` in globals.css, which is declarative and cheaper.
 */
export function PinchZoomGuard() {
  useEffect(() => {
    // Not in DocumentEventMap (they are WebKit extensions), so these resolve
    // through addEventListener's `type: string` overload. No cast needed.
    const gestures = ['gesturestart', 'gesturechange', 'gestureend'];
    const cancel = (event: Event) => event.preventDefault();

    for (const gesture of gestures) {
      // `passive: false` is required: Safari defaults touch-ish listeners on
      // document to passive, and preventDefault() is a no-op on a passive one.
      document.addEventListener(gesture, cancel, { passive: false });
    }

    return () => {
      for (const gesture of gestures) {
        document.removeEventListener(gesture, cancel);
      }
    };
  }, []);

  return null;
}
