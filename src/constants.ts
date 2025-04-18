
export const CustomEventNames = {
  programmatic: {
    seeking: "media-sync:programmatic:seeking",
    seeked: "media-sync:programmatic:seeked",
    play: "media-sync:programmatic:play",
    pause: "media-sync:programmatic:pause",
  },
  user: {
    seeking: "media-sync:user:seeking",
    seeked: "media-sync:user:seeked",
    play: "media-sync:user:play",
    pause: "media-sync:user:pause",
  },
};

export const CustomEvents = {
  programmatic: {
    seeking: new CustomEvent(CustomEventNames.programmatic.seeking),
    seeked: new CustomEvent(CustomEventNames.programmatic.seeked),
    play: new CustomEvent(CustomEventNames.programmatic.play),
    pause: new CustomEvent(CustomEventNames.programmatic.pause),
  },
  user: {
    seeking: new CustomEvent(CustomEventNames.user.seeking),
    seeked: new CustomEvent(CustomEventNames.user.seeked),
    play: new CustomEvent(CustomEventNames.user.play),
    pause: new CustomEvent(CustomEventNames.user.pause),
  },
};
