import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CustomEvents } from "./constants";
import { MediaSync } from "./media-sync";
import { MediaElementWrapper } from "./types";

// Mock the debounce utility to execute immediately in tests
vi.mock("./utils", async (importOriginal) => {
  const originalModule = await importOriginal<typeof import("./utils")>();
  return {
    ...originalModule,
    debounce: vi.fn().mockImplementation((fn) => fn)
  };
});

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
        getCurrentTime: vi.fn().mockImplementation(() => element.currentTime),
        getDuration: vi.fn().mockReturnValue(100),
        isEnded: vi.fn().mockReturnValue(false),
        seekTo: vi.fn().mockImplementation((time) => {
          element.currentTime = time;
        }),
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

    it("should sync seek position when user triggers seeking on one element", () => {
      // Setup fake timers
      vi.useFakeTimers();
      
      // Create element with two videos
      mediaSyncElement = document.createElement("media-sync") as MediaSync;
      const video1 = document.createElement("video");
      const video2 = document.createElement("video");
      
      mediaSyncElement.appendChild(video1);
      mediaSyncElement.appendChild(video2);
      document.body.appendChild(mediaSyncElement);
      
      // Initialize and setup test
      mediaSyncElement.initialize();
      
      // Access the MediaElementWrapper instances to properly mock them
      const mediaElements = (mediaSyncElement as any).mediaElements;
      
      // Set up a proper mock for seekTo that actually updates the time
      mediaElements.forEach((wrapper: MediaElementWrapper) => {
        wrapper.seekTo = vi.fn((time: number) => {
          wrapper.element.currentTime = time;
        });
      });
      
      // Set video1 to a new time
      video1.currentTime = 30;
      
      // Dispatch user seeking event on video1
      video1.dispatchEvent(CustomEvents.user.seeking);
      
      // Advance all timers to trigger the debounce callback
      vi.runAllTimers();
      
      // Since we've advanced the timers, video2 should be synced now
      expect(video2.currentTime).toBe(30);
      
      // Restore real timers
      vi.useRealTimers();
    });
  });

  describe("programmatic actions on media elements", () => {
    it("should call play() when a programmatic play event is triggered", () => {
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

      // Dispatch programmatic play event on video1
      video1.dispatchEvent(CustomEvents.programmatic.play);

      // Verify video2 play was called, but not video1 again
      expect(playFn1).not.toHaveBeenCalled();
      expect(playFn2).toHaveBeenCalled();
    });

    it("should call pause() when a programmatic pause event is triggered", () => {
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

      // Dispatch programmatic pause event on video1
      video1.dispatchEvent(CustomEvents.programmatic.pause);

      // Verify video2 pause was called, but not video1 again
      expect(pauseFn1).not.toHaveBeenCalled();
      expect(pauseFn2).toHaveBeenCalled();
    });
    
    it("should sync seek position when programmatic seeking is triggered on one element", () => {
      // Create element with two videos
      mediaSyncElement = document.createElement("media-sync") as MediaSync;
      const video1 = document.createElement("video");
      const video2 = document.createElement("video");
      
      mediaSyncElement.appendChild(video1);
      mediaSyncElement.appendChild(video2);
      document.body.appendChild(mediaSyncElement);
      
      // Initialize and setup test
      mediaSyncElement.initialize();
      
      // Access the MediaElementWrapper instances to properly mock them
      const mediaElements = (mediaSyncElement as any).mediaElements;
      
      // Set up a proper mock for seekTo that actually updates the time
      mediaElements.forEach((wrapper: MediaElementWrapper) => {
        wrapper.seekTo = vi.fn((time: number) => {
          wrapper.element.currentTime = time;
        });
      });
      
      // Set video1 to a new time
      video1.currentTime = 45;
      
      // Dispatch programmatic seeking event on video1
      video1.dispatchEvent(CustomEvents.programmatic.seeking);
      
      // Video2 should be synced to the same time
      expect(video2.currentTime).toBe(45);
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
    
    it("should get the currentTime from the main media element", () => {
      // Create element with three videos
      mediaSyncElement = document.createElement("media-sync") as MediaSync;
      const video1 = document.createElement("video");
      const video2 = document.createElement("video");
      const video3 = document.createElement("video");
      
      mediaSyncElement.appendChild(video1);
      mediaSyncElement.appendChild(video2);
      mediaSyncElement.appendChild(video3);
      document.body.appendChild(mediaSyncElement);
      
      // Initialize and setup test
      mediaSyncElement.initialize();
      
      // Set different times for each video
      video1.currentTime = 25; // First video is the main one by default
      video2.currentTime = 30;
      video3.currentTime = 35;
      
      // The currentTime getter should return the time of the main element (first one)
      expect(mediaSyncElement.currentTime).toBe(25);
    });
    
    it("should synchronize all media elements when currentTime is set", () => {
      // Create element with three videos
      mediaSyncElement = document.createElement("media-sync") as MediaSync;
      const video1 = document.createElement("video");
      const video2 = document.createElement("video");
      const video3 = document.createElement("video");
      
      mediaSyncElement.appendChild(video1);
      mediaSyncElement.appendChild(video2);
      mediaSyncElement.appendChild(video3);
      document.body.appendChild(mediaSyncElement);
      
      // Initialize and setup test
      mediaSyncElement.initialize();
      
      // Access the MediaElementWrapper instances to properly mock them
      const mediaElements = (mediaSyncElement as any).mediaElements;
      
      // Set up a proper mock for seekTo that actually updates the time
      mediaElements.forEach((wrapper: MediaElementWrapper) => {
        wrapper.seekTo = vi.fn((time: number) => {
          wrapper.element.currentTime = time;
        });
      });
      
      // Set initial times
      video1.currentTime = 10;
      video2.currentTime = 20;
      video3.currentTime = 30;
      
      // Set currentTime to sync all videos to 50 seconds
      mediaSyncElement.currentTime = 50;
      
      // All videos should be at the target time
      expect(video1.currentTime).toBe(50);
      expect(video2.currentTime).toBe(50);
      expect(video3.currentTime).toBe(50);
    });
  });
  
  describe("seeking synchronization edge cases", () => {
    it("should prevent infinite loops during multiple seeking events", () => {
      // Setup fake timers
      vi.useFakeTimers();
      
      // Create element with two videos
      mediaSyncElement = document.createElement("media-sync") as MediaSync;
      const video1 = document.createElement("video");
      const video2 = document.createElement("video");
      
      // Create spy for seekTo method
      const seekToSpy = vi.fn((time) => { 
        // Mock implementation to update the currentTime
        video2.currentTime = time;
      });
      
      mediaSyncElement.appendChild(video1);
      mediaSyncElement.appendChild(video2);
      document.body.appendChild(mediaSyncElement);
      
      // Initialize the element
      mediaSyncElement.initialize();
      
      // Override the MediaElementWrapper.seekTo implementation after initialization
      // to track calls
      const mediaElements = (mediaSyncElement as any).mediaElements;
      mediaElements.forEach((wrapper: any) => {
        if (wrapper.element === video2) {
          wrapper.seekTo = seekToSpy;
        }
      });
      
      // Trigger several seeking events in quick succession
      for (let i = 0; i < 5; i++) {
        video1.currentTime = i * 10;
        video1.dispatchEvent(CustomEvents.user.seeking);
      }
      
      // Run all timers to allow debounced functions to execute
      vi.runAllTimers();
      
      // Verify that seekTo was called (actual number depends on implementation)
      // But we should verify that at least it was called with the last time value
      expect(seekToSpy).toHaveBeenCalled();
      expect(seekToSpy).toHaveBeenCalledWith(40); // Last time value (4 * 10)
      
      // Restore real timers
      vi.useRealTimers();
    });
  });
});
