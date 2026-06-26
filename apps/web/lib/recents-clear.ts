/**
 * recents-clear — pure confirm-on-second-press state machine for the command
 * palette's "Clear recent" affordance.
 *
 * The palette's Recent section header gets a small "Clear" control. To avoid a
 * one-click data wipe, the first press ARMS the control ("Clear recent?") and
 * the second press within a short window actually clears; clicking away, a
 * timeout, or pressing Escape disarms it. This module owns that little machine
 * plus the empty-store transform, so the component stays a thin render + a
 * single localStorage write.
 *
 * No React, no timers here - the component owns the setTimeout; these are the
 * pure transitions it drives. The clear itself returns an empty list (the
 * caller serializes + persists it).
 */

import type { RecentEntry } from './command-recents';

export type ClearState = 'idle' | 'armed';

/** Default ms the armed state stays hot before auto-disarming. */
export const CLEAR_ARM_TIMEOUT_MS = 3000;

/**
 * Advance the machine on a press.
 * - idle  -> armed  (ask for confirmation; nothing cleared yet)
 * - armed -> idle   (confirmed; the caller should now clear)
 *
 * Returns the next state plus whether THIS press is the confirming one, so the
 * caller knows exactly when to wipe the store.
 */
export function pressClear(state: ClearState): { next: ClearState; confirmed: boolean } {
  if (state === 'armed') return { next: 'idle', confirmed: true };
  return { next: 'armed', confirmed: false };
}

/** Force the machine back to idle (blur / Escape / timeout / after clearing). */
export function disarmClear(): ClearState {
  return 'idle';
}

/** Label the control should show for the current state. */
export function clearLabel(state: ClearState): string {
  return state === 'armed' ? 'Clear recent?' : 'Clear';
}

/** Accessible label for the control (announces the confirm step). */
export function clearAriaLabel(state: ClearState): string {
  return state === 'armed'
    ? 'Confirm clearing recent commands'
    : 'Clear recent commands';
}

/**
 * The post-clear recents list: always empty. A function (not a bare constant)
 * so the caller gets a fresh array it can serialize + set into state without
 * sharing a reference.
 */
export function clearedRecents(): RecentEntry[] {
  return [];
}

/**
 * True when the Recent section should offer a Clear control at all - only when
 * there is at least one recent entry to clear.
 */
export function canClearRecents(list: readonly RecentEntry[]): boolean {
  return list.length > 0;
}
