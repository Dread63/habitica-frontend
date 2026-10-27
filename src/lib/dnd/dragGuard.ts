/**
 * Native HTML5 drag-and-drop resolves a drag source by walking **up the DOM
 * tree** to the nearest `draggable="true"` ancestor. That is a problem for
 * every interactive control nested inside a drag source: the mousedown that
 * should place a caret, select text, or press a button starts a drag of the
 * enclosing card instead.
 *
 * That was a real, reported bug — the notes editor inside a to-do card could
 * not be clicked into at all, because `TodoBoard` wraps each card in
 * `draggable`. The card's "Add subtask" input had the same problem.
 *
 * **A portal is not a sufficient fix**, which is worth stating because it is
 * the obvious first idea. The notes editor lives in a native `<dialog>` opened
 * with `showModal()`, so it is already promoted to the browser's *top layer for
 * painting* — but `showModal()` does not move the element in the DOM, and drag
 * source resolution is pure DOM ancestry. The controls that are not in a dialog
 * at all wouldn't be helped either way.
 *
 * The fix has to be at the drag source: turn `draggable` off for the duration
 * of a press that landed on something interactive. This module is the one place
 * that rule lives, because the app has three separate native drag sources
 * (the to-do board, the timeline's unscheduled rail, and timeline blocks) and
 * all three carry the same hazard.
 */

/**
 * Elements whose own pointer behaviour must win over an ancestor's drag.
 *
 * `dialog` is in the list for reach rather than for itself: a modal dialog
 * rendered from inside a card is a DOM descendant of the drag source, so
 * everything within it needs the same exemption even when the thing pressed is
 * something plain like a heading.
 *
 * `[data-no-drag]` is the escape hatch for anything not covered here — put it
 * on a wrapper rather than extending this list with one-off selectors.
 */
export const INTERACTIVE_SELECTOR = [
  'input',
  'textarea',
  'select',
  'button',
  'a[href]',
  'label',
  'dialog',
  '[contenteditable=""]',
  '[contenteditable="true"]',
  '[data-no-drag]',
].join(', ')

/**
 * Should a press on `target` suppress `source`'s native drag?
 *
 * Pure and DOM-only so it can be unit-tested directly rather than through a
 * hook, a component and a synthetic event — the same reason the store
 * migrations in this codebase are exported as plain functions.
 *
 * Matches `target` **or any ancestor up to `source`**, since a press usually
 * lands on a text node's parent or on an icon inside a button rather than on
 * the control itself.
 *
 * **`source` itself never matches**, and that exclusion is load-bearing: the
 * unscheduled rail's drag source *is* a `<button>` (`UnscheduledTaskList`), so
 * a boundary-less version of this check would suppress the very drag it exists
 * to protect. The rule is "an interactive element *inside* the drag source",
 * not "an interactive element".
 */
export function shouldSuppressDrag(target: EventTarget | null, source: Element | null): boolean {
  if (target === null || source === null) return false
  // Not every EventTarget is an Element (Document, Window). `closest` is an
  // Element method, so anything else is answered rather than thrown at.
  if (!(target instanceof Element)) return false
  const match = target.closest(INTERACTIVE_SELECTOR)
  if (match === null || match === source) return false
  // A match found by walking *past* the drag source belongs to some outer
  // widget and is none of this source's business.
  return source.contains(match)
}
