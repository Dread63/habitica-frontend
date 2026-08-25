import type { Task } from '@/lib/habitica/types'
import { isSchedulableTaskType } from '@/features/tasks/taskType'
import { entryForTaskOnDate, type TimelineEntry } from './timelineEntries'

/**
 * Which tasks can go on the timeline: habits/dailies/todos — rewards are
 * things you *buy*, not blocks of time (see taskType.ts's
 * `isSchedulableTaskType`, shared with the pomodoro task picker so the rule
 * lives in one place).
 *
 * Completion state deliberately does NOT filter here — the feature's stated
 * purpose includes *reviewing* how a day was organized, and a completed
 * daily at 7am is exactly the kind of thing worth seeing on yesterday's
 * timeline. Completed tasks just render dimmed (TimelineBlock).
 */
export function eligibleTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => isSchedulableTaskType(t.type))
}

/** Eligible tasks with no placement on the given date — the drag source list. */
export function unscheduledTasks(tasks: Task[], entries: TimelineEntry[], date: string): Task[] {
  return eligibleTasks(tasks).filter((t) => entryForTaskOnDate(entries, t.id, date) === undefined)
}
