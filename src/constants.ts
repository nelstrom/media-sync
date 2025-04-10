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

export const CustomEventNames = {
  pSeeking: 'media-sync:programmatic-seeking',
  pSeeked: 'media-sync:programmatic-seeked',
  pPlay: 'media-sync:programmatic-play',
  uSeeking: 'media-sync:user-seeking',
  uSeeked: 'media-sync:user-seeked',
  uPlay: 'media-sync:user-play',
}

export const CustomEvents = {
  programmatic: {
    seeking: new CustomEvent(CustomEventNames.pSeeking),
    seeked: new CustomEvent(CustomEventNames.pSeeked),
    play: new CustomEvent(CustomEventNames.pPlay),
  },
  user: {
    seeking: new CustomEvent(CustomEventNames.uSeeking),
    seeked: new CustomEvent(CustomEventNames.uSeeked),
    play: new CustomEvent(CustomEventNames.uPlay),
  }
}