import { MediaState, VALID_STATE_TRANSITIONS } from './constants';

/**
 * Simple logger utility
 */
export const Logger = {
  debug: (...args: unknown[]) => {
    if (!Logger.enableDebug) return;
    console.debug('[MediaSync]', ...args);
  },
  error: (...args: unknown[]) => {
    console.error('[MediaSync]', ...args);
  },
  enableDebug: false
};

/**
 * Checks if a state transition is valid
 */
export function isValidStateTransition(
  currentState: MediaState,
  nextState: MediaState
): boolean {
  const validNextStates = VALID_STATE_TRANSITIONS[currentState];
  if (!validNextStates) {
    return false;
  }
  return validNextStates.includes(nextState);
}