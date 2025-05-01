
// Debounce delay for seeking events (in milliseconds)
export const SEEK_DEBOUNCE_DELAY = 10;

export const CustomEventNames = {
  pause: "media-sync:pause",
  play: "media-sync:play",
  ratechange: "media-sync:ratechange",
  seeking: "media-sync:seeking",
  programmatic: {
    seeking: "media-sync:programmatic:seeking",
    seeked: "media-sync:programmatic:seeked",
    play: "media-sync:programmatic:play",
    pause: "media-sync:programmatic:pause",
    ratechange: "media-sync:programmatic:ratechange"
  },
  user: {
    seeking: "media-sync:user:seeking",
    seeked: "media-sync:user:seeked",
    play: "media-sync:user:play",
    pause: "media-sync:user:pause",
    ratechange: "media-sync:user:ratechange"
  },
} as const;
