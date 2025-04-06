/**
 * Enum representing the possible states of the media elements
 */
export enum MediaState {
  UNSTARTED = 'UNSTARTED',
  ENDED = 'ENDED',
  PLAYING = 'PLAYING',
  PAUSED = 'PAUSED',
  BUFFERING = 'BUFFERING',
  LOADING = 'LOADING',
  LOADED = 'LOADED'
}

/**
 * Map of valid state transitions
 */
export const VALID_STATE_TRANSITIONS: Record<MediaState, MediaState[]> = {
  [MediaState.LOADING]: [MediaState.LOADED],
  [MediaState.LOADED]: [MediaState.PLAYING],
  [MediaState.PLAYING]: [MediaState.PAUSED, MediaState.ENDED],
  [MediaState.PAUSED]: [MediaState.PLAYING, MediaState.ENDED],
  [MediaState.ENDED]: [MediaState.PLAYING],
  [MediaState.BUFFERING]: [],
  [MediaState.UNSTARTED]: []
};