import type { TaskPriority, TaskType } from '@/lib/habitica/types'

export interface ParsedQuickAdd {
  text: string
  type: TaskType
  priority: TaskPriority
  tagNames: string[]
}

const TYPE_TOKENS: Record<string, TaskType> = {
  habit: 'habit',
  daily: 'daily',
  todo: 'todo',
  reward: 'reward',
}

// Lead: string-start or a whitespace char (captured so it can be dropped
// along with the token, avoiding a doubled space where it was removed).
// Token: #tag, /type, or a bare !!/!/~. Lookahead requires the token be
// followed by whitespace or string-end, so symbols glued to an ordinary
// word (e.g. the trailing "!" in "emails!") are never mistaken for markers.
const TOKEN_PATTERN = /(^|\s)(#([a-zA-Z0-9_-]+)|\/(\w+)|!!|!|~)(?=\s|$)/g

/**
 * Parses the quick-add bar's shorthand — design settled with the user
 * before implementation (see CLAUDE.md/implementation-plan.md §6a):
 *   #tag    repeatable, becomes a tag (created on the fly if it doesn't
 *           already exist — see QuickAddBar's resolveTagIds)
 *   /type   habit | daily | todo | reward, case-insensitive; defaults to
 *           todo if omitted
 *   !!      hard, !  medium, ~  trivial; defaults to easy if omitted
 *
 * Whatever remains after stripping recognized tokens, whitespace collapsed,
 * is the task's text. An unrecognized `/word` (typo, or just a task title
 * that happens to contain a slash) is deliberately left in the text rather
 * than silently swallowed — see quickAdd.test.ts.
 */
export function parseQuickAdd(input: string): ParsedQuickAdd {
  const tagNames: string[] = []
  let type: TaskType = 'todo'
  let priority: TaskPriority = 1

  const stripped = input.replace(
    TOKEN_PATTERN,
    (match: string, lead: string, whole: string, tag: string | undefined, typeWord: string | undefined) => {
      if (tag !== undefined) {
        tagNames.push(tag)
        return lead
      }
      if (typeWord !== undefined) {
        const normalized = typeWord.toLowerCase()
        if (normalized in TYPE_TOKENS) {
          type = TYPE_TOKENS[normalized]
          return lead
        }
        return match // unrecognized /word - not a type marker, leave as text
      }
      if (whole === '!!') {
        priority = 2
        return lead
      }
      if (whole === '!') {
        priority = 1.5
        return lead
      }
      if (whole === '~') {
        priority = 0.1
        return lead
      }
      return match
    },
  )

  return {
    text: stripped.replace(/\s+/g, ' ').trim(),
    type,
    priority,
    tagNames,
  }
}
