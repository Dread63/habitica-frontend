import { describe, it, expect } from 'vitest'
import { shouldSuppressDrag } from './dragGuard'

/** Builds a detached tree and returns lookups by id. */
function build(html: string): (id: string) => Element {
  const root = document.createElement('div')
  root.innerHTML = html
  return (id) => {
    const el = root.querySelector(`#${id}`)
    if (!el) throw new Error(`no #${id} in fixture`)
    return el
  }
}

describe('shouldSuppressDrag', () => {
  it('suppresses a press on a textarea inside the drag source', () => {
    const $ = build('<div id="src"><textarea id="notes"></textarea></div>')
    expect(shouldSuppressDrag($('notes'), $('src'))).toBe(true)
  })

  it('suppresses a press on a plain element nested inside an interactive one', () => {
    // The real case: pressing the icon inside a button, or the text inside a
    // label — the event target is never the control itself.
    const $ = build('<div id="src"><label id="lbl"><span id="txt">Notes</span></label></div>')
    expect(shouldSuppressDrag($('txt'), $('src'))).toBe(true)
  })

  it('suppresses anything inside a nested dialog', () => {
    // TaskCard mounts its editor dialog *inside* the card. showModal() puts it
    // in the top paint layer but leaves it a DOM descendant, which is exactly
    // why the drag still won.
    const $ = build('<div id="src"><dialog id="dlg"><p id="para">hi</p></dialog></div>')
    expect(shouldSuppressDrag($('para'), $('src'))).toBe(true)
  })

  it('does NOT suppress a press on the drag source itself', () => {
    // UnscheduledTaskList's drag source IS a <button>. Without the source
    // exclusion this check would break the drag it exists to protect.
    const $ = build('<div><button id="src">Task</button></div>')
    expect(shouldSuppressDrag($('src'), $('src'))).toBe(false)
  })

  it('does NOT suppress a press on plain content inside a button drag source', () => {
    const $ = build('<div><button id="src"><span id="txt">Task</span></button></div>')
    expect(shouldSuppressDrag($('txt'), $('src'))).toBe(false)
  })

  it('does NOT suppress a press on non-interactive content', () => {
    const $ = build('<div id="src"><p id="body">Some notes preview</p></div>')
    expect(shouldSuppressDrag($('body'), $('src'))).toBe(false)
  })

  it('ignores an interactive element that is outside the drag source', () => {
    const $ = build('<div><button id="outer"><div id="src"><p id="body">x</p></div></button></div>')
    // The match is found by walking *past* the source; it belongs to an outer
    // widget, so this source has no business suppressing itself for it.
    expect(shouldSuppressDrag($('body'), $('src'))).toBe(false)
  })

  it('answers false for a null target or a null source', () => {
    const $ = build('<div id="src"><input id="in" /></div>')
    expect(shouldSuppressDrag(null, $('src'))).toBe(false)
    expect(shouldSuppressDrag($('in'), null)).toBe(false)
  })

  it('answers false for an EventTarget that is not an Element', () => {
    const $ = build('<div id="src"></div>')
    expect(shouldSuppressDrag(document, $('src'))).toBe(false)
    expect(shouldSuppressDrag(window, $('src'))).toBe(false)
  })
})
