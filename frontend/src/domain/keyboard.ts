import type { KeyboardEvent } from 'react'

/** True while a Korean (or other IME) composition is still open, so Enter must not paste the note. */
export const isComposing = (event: KeyboardEvent): boolean =>
  event.nativeEvent.isComposing || event.keyCode === 229
