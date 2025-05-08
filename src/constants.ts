
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