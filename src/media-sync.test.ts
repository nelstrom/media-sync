import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CustomEvents } from "./constants";
import { MediaSync } from "./media-sync";

// Mock the MediaElementWrapper implementation
vi.mock("./media-element-wrapper", () => {
  return {
    MediaElementWrapperImpl: vi
      .fn()
      .mockImplementation((element, options = {}) => ({
        id: Math.random().toString(36).substring(2, 15),
        element,
        isMain: options.isMain || false,
        state: "LOADING",
        isPlaying: false,
        play: vi.fn().mockImplementation(async () => {
          return element.play();
        }),
        pause: vi.fn().mockImplementation(() => {
          element.pause();
        }),
        getCurrentTime: vi.fn().mockReturnValue(0),
        getDuration: vi.fn().mockReturnValue(100),
        isEnded: vi.fn().mockReturnValue(false),
        seekTo: vi.fn(),
      })),
  };
});

// Basic tests for initializing/creating the MediaSync custom element
describe("MediaSync", () => {
  let mediaSyncElement: MediaSync;

  afterEach(() => {
    if (mediaSyncElement && mediaSyncElement.parentNode) {
      mediaSyncElement.parentNode.removeChild(mediaSyncElement);
    }
    vi.clearAllMocks();
  });

  beforeAll(() => {
    // Setup global mocks for HTMLMediaElement
    HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    HTMLMediaElement.prototype.pause = vi.fn();

    // Define necessary properties for HTMLMediaElement
    Object.defineProperties(HTMLMediaElement.prototype, {
      currentTime: {
        get: function () {
          return this._currentTime || 0;
        },
        set: function (value) {
          this._currentTime = value;
        },
      },
      duration: {
        get: function () {
          return this._duration || 100;
        },
        set: function (value) {
          this._duration = value;
        },
      },
    });

    // Register the custom element if not already registered
    if (!customElements.get("media-sync")) {
      customElements.define("media-sync", MediaSync);
    }
  });

  describe("initialization", () => {
    it("custom element uses MediaSync backing class", () => {
      mediaSyncElement = document.createElement("media-sync") as MediaSync;
      expect(mediaSyncElement).toBeInstanceOf(MediaSync);
    });

    it("custom element registry contains media-sync element", () => {
      const mediaSync = customElements.get("media-sync");
      expect(mediaSync).toBeDefined();
      expect(mediaSync?.name).toBe("MediaSync");
    });
  });

  describe("user initiated actions", () => {
    it("should sync play to other media elements when a user triggers play on one element", () => {
      // Create element with two videos
      mediaSyncElement = document.createElement("media-sync") as MediaSync;
      const video1 = document.createElement("video");
      const video2 = document.createElement("video");

      // Create spy functions for play
      const playFn1 = vi.fn().mockResolvedValue(undefined);
      const playFn2 = vi.fn().mockResolvedValue(undefined);
      video1.play = playFn1;
      video2.play = playFn2;

      mediaSyncElement.appendChild(video1);
      mediaSyncElement.appendChild(video2);
      document.body.appendChild(mediaSyncElement);

      // Initialize and reset mocks before testing
      mediaSyncElement.initialize();
      vi.clearAllMocks();

      // Dispatch user play event on video1
      video1.dispatchEvent(CustomEvents.user.play);

      // Verify video2 play was called, but not video1 again
      expect(playFn1).not.toHaveBeenCalled();
      expect(playFn2).toHaveBeenCalled();
    });

    it("should sync pause to other media elements when a user triggers pause on one element", () => {
      // Create element with two videos
      mediaSyncElement = document.createElement("media-sync") as MediaSync;
      const video1 = document.createElement("video");
      const video2 = document.createElement("video");

      // Create spy functions for pause
      const pauseFn1 = vi.fn();
      const pauseFn2 = vi.fn();
      video1.pause = pauseFn1;
      video2.pause = pauseFn2;

      mediaSyncElement.appendChild(video1);
      mediaSyncElement.appendChild(video2);
      document.body.appendChild(mediaSyncElement);

      // Initialize and reset mocks before testing
      mediaSyncElement.initialize();
      vi.clearAllMocks();

      // Dispatch user pause event on video1
      video1.dispatchEvent(CustomEvents.user.pause);

      // Verify video2 pause was called, but not video1 again
      expect(pauseFn1).not.toHaveBeenCalled();
      expect(pauseFn2).toHaveBeenCalled();
    });
  });

  describe("programmatic actions on media elements", () => {
    it("should call play() when a programmatic play event is triggered", () => {
      // Create element with one video
      mediaSyncElement = document.createElement("media-sync") as MediaSync;
      const videoElement = document.createElement("video");
      mediaSyncElement.appendChild(videoElement);
      document.body.appendChild(mediaSyncElement);

      // Mock the MediaSync play method
      const playSpy = vi
        .spyOn(mediaSyncElement, "play")
        .mockImplementation(() => Promise.resolve());

      // Initialize and trigger programmatic play event
      mediaSyncElement.initialize();
      videoElement.dispatchEvent(CustomEvents.programmatic.play);

      // Verify play was called at least once
      expect(playSpy).toHaveBeenCalled();
    });

    it("should call pause() when a programmatic pause event is triggered", () => {
      // Create element with one video
      mediaSyncElement = document.createElement("media-sync") as MediaSync;
      const videoElement = document.createElement("video");
      mediaSyncElement.appendChild(videoElement);
      document.body.appendChild(mediaSyncElement);

      // Mock the MediaSync pause method
      const pauseSpy = vi
        .spyOn(mediaSyncElement, "pause")
        .mockImplementation(() => {});

      // Initialize and trigger programmatic pause event
      mediaSyncElement.initialize();
      videoElement.dispatchEvent(CustomEvents.programmatic.pause);

      // Verify pause was called at least once
      expect(pauseSpy).toHaveBeenCalled();
    });
  });

  describe("programmatic actions on MediaSync element", () => {
    it("should play all media elements when the MediaSync play() is called", async () => {
      // Create element with two videos
      mediaSyncElement = document.createElement("media-sync") as MediaSync;
      const video1 = document.createElement("video");
      const video2 = document.createElement("video");

      // Create spy functions for play
      const playFn1 = vi.fn().mockResolvedValue(undefined);
      const playFn2 = vi.fn().mockResolvedValue(undefined);
      video1.play = playFn1;
      video2.play = playFn2;

      mediaSyncElement.appendChild(video1);
      mediaSyncElement.appendChild(video2);
      document.body.appendChild(mediaSyncElement);

      // Initialize and call play
      mediaSyncElement.initialize();
      await mediaSyncElement.play();

      // Verify both videos were played
      expect(playFn1).toHaveBeenCalled();
      expect(playFn2).toHaveBeenCalled();
    });

    it("should pause all media elements when the MediaSync pause() is called", () => {
      // Create element with two videos
      mediaSyncElement = document.createElement("media-sync") as MediaSync;
      const video1 = document.createElement("video");
      const video2 = document.createElement("video");

      // Create spy functions for pause
      const pauseFn1 = vi.fn();
      const pauseFn2 = vi.fn();
      video1.pause = pauseFn1;
      video2.pause = pauseFn2;

      mediaSyncElement.appendChild(video1);
      mediaSyncElement.appendChild(video2);
      document.body.appendChild(mediaSyncElement);

      // Initialize and call pause
      mediaSyncElement.initialize();
      mediaSyncElement.pause();

      // Verify both videos were paused
      expect(pauseFn1).toHaveBeenCalled();
      expect(pauseFn2).toHaveBeenCalled();
    });
  });
});
