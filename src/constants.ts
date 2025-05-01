
// Debounce delay for seeking events (in milliseconds)
export const SEEK_DEBOUNCE_DELAY = 10;

export const CustomEventNames = {
  pause: "media-sync:pause",
  play: "media-sync:play",
  ratechange: "media-sync:ratechange",
  seeking: "media-sync:seeking",
} as const;
