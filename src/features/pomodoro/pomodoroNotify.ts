import type { PomodoroPhase } from './pomodoroEngine'

/**
 * Phase-end alerting. Once the timer stopped rolling itself into the next
 * phase, *some* signal became mandatory — a focus block that ends silently
 * while you're in another tab is a block that runs over by twenty minutes.
 *
 * Two independent channels, both opt-out in settings: a short chime and a
 * browser Notification. Everything here degrades quietly — no audio device,
 * a browser without Notification, a denied permission — because none of it
 * is load-bearing: the in-app panel and nav pill always show the seam.
 */

let audioContext: AudioContext | null = null

/**
 * Create/resume the AudioContext from inside a user gesture (the Start
 * button). Browsers refuse to start audio otherwise, and the chime fires
 * from a timer callback minutes later, which is emphatically not a gesture —
 * so the unlock has to be primed at the one moment a gesture is available.
 */
export function primeAudio(): void {
  try {
    audioContext ??= new AudioContext()
    if (audioContext.state === 'suspended') void audioContext.resume()
  } catch {
    audioContext = null // no audio device / blocked — chimes just no-op
  }
}

/** Two short sine blips — no asset file, no network fetch, no CDN. */
function playChime(): void {
  const ctx = audioContext
  if (!ctx || ctx.state !== 'running') return
  const now = ctx.currentTime
  for (const [index, frequency] of [660, 880].entries()) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = frequency
    // A quick attack/decay envelope — a raw gate on a sine clicks audibly.
    const start = now + index * 0.18
    gain.gain.setValueAtTime(0, start)
    gain.gain.linearRampToValueAtTime(0.18, start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.16)
    osc.connect(gain).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + 0.18)
  }
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.permission
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported'
  try {
    return await Notification.requestPermission()
  } catch {
    return Notification.permission
  }
}

const PHASE_NOUN: Record<PomodoroPhase, string> = {
  work: 'Focus',
  shortBreak: 'Short break',
  longBreak: 'Long break',
}

/** Copy for both the notification and the in-app seam banner, one source. */
export function phaseSeamMessage(finished: PomodoroPhase, next: PomodoroPhase): { title: string; body: string } {
  const nextLabel = PHASE_NOUN[next].toLowerCase()
  return {
    title: `${PHASE_NOUN[finished]} complete`,
    body: finished === 'work' ? `Logged. Start your ${nextLabel} when you're ready.` : `Ready for ${nextLabel}.`,
  }
}

export function alertPhaseComplete(
  finished: PomodoroPhase,
  next: PomodoroPhase,
  options: { sound: boolean; notifications: boolean },
): void {
  if (options.sound) playChime()
  if (!options.notifications || notificationPermission() !== 'granted') return
  const { title, body } = phaseSeamMessage(finished, next)
  try {
    // `tag` collapses repeats rather than stacking one per phase seam.
    new Notification(title, { body, tag: 'habitica-frontend:pomodoro' })
  } catch {
    // Some browsers only allow Notification via a service worker; the
    // in-app seam already covers this case.
  }
}
