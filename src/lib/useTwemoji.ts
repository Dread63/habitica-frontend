import * as React from 'react'
import twemoji from '@twemoji/api'

/**
 * Replaces emoji characters inside the returned ref's element with <img>
 * tags after each render (see src/index.css for the `img.emoji` sizing
 * rule). This is necessary because we can't assume the host OS has a
 * color-emoji font installed — true of plenty of self-hosted Linux setups —
 * and CSS font-family fallback can't materialize glyphs that don't exist
 * anywhere on the system.
 *
 * Trade-off, disclosed rather than silently decided: this fetches emoji
 * images from jsdelivr's CDN (Twemoji's default), the one deliberate
 * external dependency beyond habitica.com itself. Self-hosting the SVG set
 * locally is a reasonable follow-up if that's undesirable — swap the `base`
 * option below for a local `/twemoji/` path once the assets are vendored.
 *
 * Mutating the DOM directly (rather than rendering <img> from React) is the
 * standard way to use Twemoji; running it in a `useEffect` keyed on the
 * actual text means React's next render of this component (e.g. after a
 * task refetch) starts from a fresh text node and gets re-parsed, rather
 * than fighting React's reconciliation.
 */
export function useTwemoji<T extends HTMLElement>(deps: React.DependencyList) {
  const ref = React.useRef<T>(null)

  React.useEffect(() => {
    if (ref.current) {
      twemoji.parse(ref.current, { className: 'emoji' })
    }
    // Intentionally keyed on caller-provided deps (the text content), not `ref`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return ref
}
