/**
 * Colors for focus categories (the user's tracked tags).
 *
 * Habitica's own Tag objects carry no color, so this app assigns one.
 * Assignment is positional — the Nth tag in `settings.trackedTagIds` gets
 * the Nth palette slot — which makes it stable in practice (toggling a tag
 * on appends it; nothing reorders the list) while needing zero extra
 * persisted state. It also honors the categorical-palette rule that hues are
 * handed out in fixed order and never cycled: past the eight validated
 * slots, a category is *neutral*, not a repeated hue, and charts fold those
 * into a single "Other" band while the detailed lists still name each one
 * individually (identity by label, not by color).
 *
 * The hex values themselves live in index.css as --cat-1..--cat-8 so both
 * themes swap in one place; see the comment there for the validation record.
 */

export const CATEGORY_COLOR_SLOTS = 8

/** null = beyond the palette; render neutral and group as "Other" in charts. */
export function categoryColor(tagId: string, trackedTagIds: string[]): string | null {
  const index = trackedTagIds.indexOf(tagId)
  if (index < 0 || index >= CATEGORY_COLOR_SLOTS) return null
  return `var(--cat-${index + 1})`
}

/** The neutral used for untracked/uncategorized time and overflow categories. */
export const UNCATEGORIZED_COLOR = 'var(--muted-foreground)'

/** `categoryColor` with the neutral already substituted — for fills. */
export function categoryFill(tagId: string | null, trackedTagIds: string[]): string {
  if (tagId === null) return UNCATEGORIZED_COLOR
  return categoryColor(tagId, trackedTagIds) ?? UNCATEGORIZED_COLOR
}
