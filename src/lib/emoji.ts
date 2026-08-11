import { emojify as nodeEmojify } from 'node-emoji'

/**
 * Habitica's own editor lets you insert emoji as GitHub-style `:shortcode:`
 * text (e.g. `:tomato:`), and habitica.com renders those as real emoji. This
 * app's markdown/text rendering had no idea what to do with that syntax, so
 * it showed up literally as `:tomato:` instead of 🍅.
 *
 * This converts shortcodes to their actual Unicode character. `useTwemoji`
 * then takes over at render time and swaps *that* Unicode character for an
 * `<img>` — see its own comment for why (not every host OS/Linux desktop has
 * a color-emoji font installed). The two steps are independent: this one is
 * "make `:tomato:` a real character", that one is "make characters render
 * consistently everywhere".
 *
 * Unrecognized/malformed shortcodes (a typo, or a bare `:` in prose that
 * isn't emoji at all) are left as literal text by node-emoji's default
 * fallback — never silently dropped.
 */
export function emojify(text: string): string {
  return nodeEmojify(text)
}
