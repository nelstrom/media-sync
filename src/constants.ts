
// Debounce delay for seeking events (in milliseconds)
export const SEEK_DEBOUNCE_DELAY = 10;

export const MediaEvent = {
  pause: "media-sync:pause",
  play: "media-sync:play",
  ratechange: "media-sync:ratechange",
  seeking: "media-sync:seeking",
  emptied: "media-sync:emptied",
  loadedmetadata: "media-sync:loadedmetadata",
  loadeddata: "media-sync:loadeddata",
  canplay: "media-sync:canplay",
  canplaythrough: "media-sync:canplaythrough",
  waiting: "media-sync:waiting",
} as const;

export type MediaEventName = (typeof MediaEvent)[keyof typeof MediaEvent];

/**
 * ReadyState type that maps to HTMLMediaElement readyState values
 * 0 = HAVE_NOTHING
 * 1 = HAVE_METADATA
 * 2 = HAVE_CURRENT_DATA
 * 3 = HAVE_FUTURE_DATA
 * 4 = HAVE_ENOUGH_DATA
 */
export type ReadyState = 0 | 1 | 2 | 3 | 4;