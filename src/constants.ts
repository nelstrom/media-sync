/**
 * Enum representing the possible states of the media elements
 */
export enum MediaState {
  UNSTARTED = "UNSTARTED",
  ENDED = "ENDED",
  PLAYING = "PLAYING",
  PAUSED = "PAUSED",
  BUFFERING = "BUFFERING",
  LOADING = "LOADING",
  LOADED = "LOADED",
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
  [MediaState.UNSTARTED]: [],
};

export const CustomEventNames = {
  programmatic: {
    seeking: "media-sync:programmatic:seeking",
    seeked: "media-sync:programmatic:seeked",
    play: "media-sync:programmatic:play",
  },
  user: {
    seeking: "media-sync:user:seeking",
    seeked: "media-sync:user:seeked",
    play: "media-sync:user:play",
  },
};

export const CustomEvents = {
  programmatic: {
    seeking: new CustomEvent(CustomEventNames.programmatic.seeking),
    seeked: new CustomEvent(CustomEventNames.programmatic.seeked),
    play: new CustomEvent(CustomEventNames.programmatic.play),
  },
  user: {
    seeking: new CustomEvent(CustomEventNames.user.seeking),
    seeked: new CustomEvent(CustomEventNames.user.seeked),
    play: new CustomEvent(CustomEventNames.user.play),
  },
};
