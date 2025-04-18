import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { CustomEvents } from "./constants";
import { MediaSync } from "./media-sync";

// Need to define these mocks before any imports
const wrapperMap = new Map();

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
    // Export a function to access the wrapper map to avoid hoisting issues
    __getWrapperMap: () => wrapperMap,
    
    MediaElementWrapperImpl: vi.fn().mockImplementation((element, options = {}) => {
      const id = Math.random().toString(36).substring(2, 15);
      
      // Create a play function that will call the element's play method
      const playFn = vi.fn().mockImplementation(async () => {
        try {
          return await element.play();
        } catch (error) {
          console.error("Error playing media in test:", error);
        }
      });
      
      // Create a pause function that will call the element's pause method
      const pauseFn = vi.fn().mockImplementation(() => {
        element.pause();
      });
      
      // Create the wrapper object with necessary methods
      const mockWrapper = {
        id,
        // Private property, but exposed for testing
        _element: element,
        isMain: options.isMain || false,
        
        // Methods
        play: playFn,
        pause: pauseFn,
        isEnded: vi.fn().mockReturnValue(false),
        isPlaying: vi.fn().mockImplementation(() => !element.paused),
        isPaused: vi.fn().mockImplementation(() => element.paused),
        connectToAudioContext: vi.fn(),
        disconnectFromAudioContext: vi.fn(),
                
        // For compatibility with otherTracks method that uses internal accessor
        get element() {
          return element;
        }
      };
      
      // Define getters/setters
      Object.defineProperty(mockWrapper, 'currentTime', {
        configurable: true,
        get: function() { 
          return element.currentTime; 
        },
        set: function(time) { 
          element.currentTime = time; 
        }
      });
      
      Object.defineProperty(mockWrapper, 'duration', {
        configurable: true,
        get: function() { 
          return element.duration || 100; 
        }
      });
      
      // Store the wrapper in the map for later reference
      wrapperMap.set(element, mockWrapper);
      
      return mockWrapper;
    })
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

      // Create spy functions for play (we still need these for HTMLMediaElement)
      const elementPlayFn1 = vi.fn().mockResolvedValue(undefined);
      const elementPlayFn2 = vi.fn().mockResolvedValue(undefined);
      video1.play = elementPlayFn1;
      video2.play = elementPlayFn2;

      mediaSyncElement.appendChild(video1);
      mediaSyncElement.appendChild(video2);
      document.body.appendChild(mediaSyncElement);

      // Initialize the element
      mediaSyncElement.initialize();
      
      // Get the wrappers for our elements
      const wrapper1 = wrapperMap.get(video1);
      const wrapper2 = wrapperMap.get(video2);
      
      // Create spies for our wrapper's play methods
      const playFn1 = vi.spyOn(wrapper1, "play");
      const playFn2 = vi.spyOn(wrapper2, "play");
      
      // Reset mocks before testing
      vi.clearAllMocks();

      // Dispatch user play event on video1
      video1.dispatchEvent(CustomEvents.user.play);

      // Verify wrapper2's play was called, but not wrapper1's again
      expect(playFn1).not.toHaveBeenCalled();
      expect(playFn2).toHaveBeenCalled();
    });

    it("should sync pause to other media elements when a user triggers pause on one element", () => {
      // Create element with two videos
      mediaSyncElement = document.createElement("media-sync") as MediaSync;
      const video1 = document.createElement("video");
      const video2 = document.createElement("video");

      // Create spy functions for HTMLMediaElement pause
      const elementPauseFn1 = vi.fn();
      const elementPauseFn2 = vi.fn();
      video1.pause = elementPauseFn1;
      video2.pause = elementPauseFn2;

      mediaSyncElement.appendChild(video1);
      mediaSyncElement.appendChild(video2);
      document.body.appendChild(mediaSyncElement);

      // Initialize the element
      mediaSyncElement.initialize();
      
      // Get the wrappers for our elements
      const wrapper1 = wrapperMap.get(video1);
      const wrapper2 = wrapperMap.get(video2);
      
      // Create spies for our wrapper's pause methods
      const pauseFn1 = vi.spyOn(wrapper1, "pause");
      const pauseFn2 = vi.spyOn(wrapper2, "pause");
      
      // Reset mocks before testing
      vi.clearAllMocks();

      // Dispatch user pause event on video1
      video1.dispatchEvent(CustomEvents.user.pause);

      // Verify wrapper2's pause was called, but not wrapper1's again
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
      
      // Access wrapper map
      const wrapper2 = wrapperMap.get(video2);
      
      // Create a spy on the wrapper's currentTime setter
      const setCurrentTimeSpy = vi.spyOn(wrapper2, "currentTime", "set");
      
      // Set video1 to a new time
      video1.currentTime = 30;
      
      // Dispatch user seeking event on video1
      video1.dispatchEvent(CustomEvents.user.seeking);
      
      // Advance all timers to trigger the debounce callback
      vi.runAllTimers();
      
      // Verify that video2's currentTime setter was called with the correct value
      expect(setCurrentTimeSpy).toHaveBeenCalledWith(30);
      
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

      // Create spy functions for element play
      const elementPlayFn1 = vi.fn().mockResolvedValue(undefined);
      const elementPlayFn2 = vi.fn().mockResolvedValue(undefined);
      video1.play = elementPlayFn1;
      video2.play = elementPlayFn2;

      mediaSyncElement.appendChild(video1);
      mediaSyncElement.appendChild(video2);
      document.body.appendChild(mediaSyncElement);

      // Initialize and setup wrapper spies
      mediaSyncElement.initialize();
      
      // Access wrapper map
      const wrapper1 = wrapperMap.get(video1);
      const wrapper2 = wrapperMap.get(video2);
      
      // Create spies for our wrapper's play methods
      const playFn1 = vi.spyOn(wrapper1, "play");
      const playFn2 = vi.spyOn(wrapper2, "play");
      
      // Reset mocks before testing
      vi.clearAllMocks();

      // Dispatch programmatic play event on video1
      video1.dispatchEvent(CustomEvents.programmatic.play);

      // Verify wrapper2's play was called, but not wrapper1's again
      expect(playFn1).not.toHaveBeenCalled();
      expect(playFn2).toHaveBeenCalled();
    });

    it("should call pause() when a programmatic pause event is triggered", () => {
      // Create element with two videos
      mediaSyncElement = document.createElement("media-sync") as MediaSync;
      const video1 = document.createElement("video");
      const video2 = document.createElement("video");

      // Create spy functions for element pause
      const elementPauseFn1 = vi.fn();
      const elementPauseFn2 = vi.fn();
      video1.pause = elementPauseFn1;
      video2.pause = elementPauseFn2;

      mediaSyncElement.appendChild(video1);
      mediaSyncElement.appendChild(video2);
      document.body.appendChild(mediaSyncElement);

      // Initialize and setup wrapper spies
      mediaSyncElement.initialize();
      
      // Access wrapper map
      const wrapper1 = wrapperMap.get(video1);
      const wrapper2 = wrapperMap.get(video2);
      
      // Create spies for our wrapper's pause methods
      const pauseFn1 = vi.spyOn(wrapper1, "pause");
      const pauseFn2 = vi.spyOn(wrapper2, "pause");
      
      // Reset mocks before testing
      vi.clearAllMocks();

      // Dispatch programmatic pause event on video1
      video1.dispatchEvent(CustomEvents.programmatic.pause);

      // Verify wrapper2's pause was called, but not wrapper1's again
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
      
      // Access wrapper map
      const wrapper2 = wrapperMap.get(video2);
      
      // Create a spy on the wrapper's currentTime setter
      const setCurrentTimeSpy = vi.spyOn(wrapper2, "currentTime", "set");
      
      // Set video1 to a new time
      video1.currentTime = 45;
      
      // Dispatch programmatic seeking event on video1
      video1.dispatchEvent(CustomEvents.programmatic.seeking);
      
      // Verify wrapper2's currentTime setter was called with the correct value
      expect(setCurrentTimeSpy).toHaveBeenCalledWith(45);
      
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

      // Create spy functions for element play
      const elementPlayFn1 = vi.fn().mockResolvedValue(undefined);
      const elementPlayFn2 = vi.fn().mockResolvedValue(undefined);
      video1.play = elementPlayFn1;
      video2.play = elementPlayFn2;

      mediaSyncElement.appendChild(video1);
      mediaSyncElement.appendChild(video2);
      document.body.appendChild(mediaSyncElement);

      // Initialize
      mediaSyncElement.initialize();
      
      // Access wrapper map
      const wrapper1 = wrapperMap.get(video1);
      const wrapper2 = wrapperMap.get(video2);
      
      // Create spies for our wrapper's play methods
      const playFn1 = vi.spyOn(wrapper1, "play");
      const playFn2 = vi.spyOn(wrapper2, "play");
      
      // Clear mocks before testing
      vi.clearAllMocks();
      
      // Call play
      await mediaSyncElement.play();

      // Verify both wrappers were played
      expect(playFn1).toHaveBeenCalled();
      expect(playFn2).toHaveBeenCalled();
    });

    it("should pause all media elements when the MediaSync pause() is called", () => {
      // Create element with two videos
      mediaSyncElement = document.createElement("media-sync") as MediaSync;
      const video1 = document.createElement("video");
      const video2 = document.createElement("video");

      // Create spy functions for element pause
      const elementPauseFn1 = vi.fn();
      const elementPauseFn2 = vi.fn();
      video1.pause = elementPauseFn1;
      video2.pause = elementPauseFn2;

      mediaSyncElement.appendChild(video1);
      mediaSyncElement.appendChild(video2);
      document.body.appendChild(mediaSyncElement);

      // Initialize
      mediaSyncElement.initialize();
      
      // Access wrapper map
      const wrapper1 = wrapperMap.get(video1);
      const wrapper2 = wrapperMap.get(video2);
      
      // Create spies for our wrapper's pause methods
      const pauseFn1 = vi.spyOn(wrapper1, "pause");
      const pauseFn2 = vi.spyOn(wrapper2, "pause");
      
      // Clear mocks before testing
      vi.clearAllMocks();
      
      // Call pause
      mediaSyncElement.pause();

      // Verify both wrappers were paused
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
      
      // Main element (video1) is used for currentTime
      
      // Skip spying on the getter since it's difficult to intercept
      // but verify the result is coming from the main element
      expect(mediaSyncElement.currentTime).toBe(25);
      
      // Set a different time on the main element and verify it's reflected
      video1.currentTime = 40;
      expect(mediaSyncElement.currentTime).toBe(40);
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
      
      // Access wrapper map
      const wrapper1 = wrapperMap.get(video1);
      const wrapper2 = wrapperMap.get(video2);
      const wrapper3 = wrapperMap.get(video3);
      
      // Create spies on the currentTime setters
      const setCurrentTimeSpy1 = vi.spyOn(wrapper1, "currentTime", "set");
      const setCurrentTimeSpy2 = vi.spyOn(wrapper2, "currentTime", "set");
      const setCurrentTimeSpy3 = vi.spyOn(wrapper3, "currentTime", "set");
      
      // Set initial times
      video1.currentTime = 10;
      video2.currentTime = 20;
      video3.currentTime = 30;
      
      // Clear mocks before testing
      vi.clearAllMocks();
      
      // Set currentTime to sync all videos to 50 seconds
      mediaSyncElement.currentTime = 50;
      
      // Verify setters were called with the correct value
      expect(setCurrentTimeSpy1).toHaveBeenCalledWith(50);
      expect(setCurrentTimeSpy2).toHaveBeenCalledWith(50);
      expect(setCurrentTimeSpy3).toHaveBeenCalledWith(50);
      
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
      
      mediaSyncElement.appendChild(video1);
      mediaSyncElement.appendChild(video2);
      document.body.appendChild(mediaSyncElement);
      
      // Initialize the element
      mediaSyncElement.initialize();
      
      // Access wrapper map
      const wrapper2 = wrapperMap.get(video2);
      
      // Create a spy on the wrapper's currentTime setter
      const setCurrentTimeSpy = vi.spyOn(wrapper2, "currentTime", "set");
      
      // Reset mocks before the main test
      vi.clearAllMocks();
      
      // Trigger several seeking events in quick succession
      for (let i = 0; i < 5; i++) {
        video1.currentTime = i * 10;
        video1.dispatchEvent(CustomEvents.user.seeking);
      }
      
      // Run all timers to allow debounced functions to execute
      vi.runAllTimers();
      
      // Verify that wrapper2's currentTime setter was called with the correct value
      expect(setCurrentTimeSpy).toHaveBeenCalledWith(40); // Last time value (4 * 10)
      
      // Verify that video2 time was synced to the last time value of video1
      expect(video2.currentTime).toBe(40);
      
      // Restore real timers
      vi.useRealTimers();
    });
  });
  
  describe("disabled attribute", () => {
    it("should not synchronize media elements when disabled is set", () => {
      // Setup fake timers
      vi.useFakeTimers();
      
      // Create element with two videos
      mediaSyncElement = document.createElement("media-sync") as MediaSync;
      mediaSyncElement.setAttribute("disabled", "");
      
      const video1 = document.createElement("video");
      const video2 = document.createElement("video");
      
      mediaSyncElement.appendChild(video1);
      mediaSyncElement.appendChild(video2);
      document.body.appendChild(mediaSyncElement);
      
      // Initialize the element
      mediaSyncElement.initialize();
      
      // Access wrapper map
      const wrapper2 = wrapperMap.get(video2);
      
      // Create a spy on the wrapper's currentTime setter
      const setCurrentTimeSpy = vi.spyOn(wrapper2, "currentTime", "set");
      
      // Set initial times
      video1.currentTime = 10;
      video2.currentTime = 20;
      
      // Clear mocks before testing
      vi.clearAllMocks();
      
      // Dispatch seeking event on the first video
      video1.dispatchEvent(CustomEvents.user.seeking);
      
      // Run all timers to allow debounced functions to execute
      vi.runAllTimers();
      
      // Verify that wrapper2's currentTime setter was NOT called
      expect(setCurrentTimeSpy).not.toHaveBeenCalled();
      
      // Verify that video2 time was NOT synced to video1 (still at original time)
      expect(video2.currentTime).toBe(20);
      
      // Now enable synchronization by removing the disabled attribute
      mediaSyncElement.removeAttribute("disabled");
      
      // Trigger seeking again
      video1.currentTime = 30;
      video1.dispatchEvent(CustomEvents.user.seeking);
      
      // Run all timers to allow debounced functions to execute
      vi.runAllTimers();
      
      // Verify that wrapper2's currentTime setter WAS called with the correct value
      expect(setCurrentTimeSpy).toHaveBeenCalledWith(30);
      
      // Verify that video2 IS now synced to video1 after enabling
      expect(video2.currentTime).toBe(30);
      
      // Test with property setter too
      mediaSyncElement.disabled = true;
      
      // Clear mocks again
      vi.clearAllMocks();
      
      // Trigger seeking again
      video1.currentTime = 40;
      video1.dispatchEvent(CustomEvents.user.seeking);
      
      // Run all timers to allow debounced functions to execute
      vi.runAllTimers();
      
      // Verify that wrapper2's currentTime setter was NOT called again
      expect(setCurrentTimeSpy).not.toHaveBeenCalled();
      
      // Verify that video2 is still at the previous time (not synced)
      expect(video2.currentTime).toBe(30);
      
      // Restore real timers
      vi.useRealTimers();
    });
    
    it("should make public methods no-ops when disabled", () => {
      // Create element with two videos
      mediaSyncElement = document.createElement("media-sync") as MediaSync;
      mediaSyncElement.setAttribute("disabled", "");
      
      const video1 = document.createElement("video");
      const video2 = document.createElement("video");
      
      // Create spy functions for element play/pause
      const elementPlayFn1 = vi.fn().mockResolvedValue(undefined);
      const elementPlayFn2 = vi.fn().mockResolvedValue(undefined);
      const elementPauseFn1 = vi.fn();
      const elementPauseFn2 = vi.fn();
      video1.play = elementPlayFn1;
      video2.play = elementPlayFn2;
      video1.pause = elementPauseFn1;
      video2.pause = elementPauseFn2;
      
      mediaSyncElement.appendChild(video1);
      mediaSyncElement.appendChild(video2);
      document.body.appendChild(mediaSyncElement);
      
      // Initialize the element
      mediaSyncElement.initialize();
      
      // Access wrapper map
      const wrapper1 = wrapperMap.get(video1);
      const wrapper2 = wrapperMap.get(video2);
      
      // Create spies for our wrapper's methods
      const playFn1 = vi.spyOn(wrapper1, "play");
      const playFn2 = vi.spyOn(wrapper2, "play");
      const pauseFn1 = vi.spyOn(wrapper1, "pause");
      const pauseFn2 = vi.spyOn(wrapper2, "pause");
      const setCurrentTimeSpy1 = vi.spyOn(wrapper1, "currentTime", "set");
      const setCurrentTimeSpy2 = vi.spyOn(wrapper2, "currentTime", "set");
      
      // Reset mocks before testing
      vi.clearAllMocks();
      
      // Set initial times
      video1.currentTime = 10;
      video2.currentTime = 20;
      
      // Test play() method - should be a no-op
      mediaSyncElement.play();
      
      // Neither wrapper's play method should be called
      expect(playFn1).not.toHaveBeenCalled();
      expect(playFn2).not.toHaveBeenCalled();
      
      // Test pause() method - should be a no-op
      mediaSyncElement.pause();
      
      // Neither wrapper's pause method should be called
      expect(pauseFn1).not.toHaveBeenCalled();
      expect(pauseFn2).not.toHaveBeenCalled();
      
      // Test currentTime setter - should be a no-op
      mediaSyncElement.currentTime = 50;
      
      // Neither wrapper's currentTime setter should be called
      expect(setCurrentTimeSpy1).not.toHaveBeenCalled();
      expect(setCurrentTimeSpy2).not.toHaveBeenCalled();
      
      // Times should remain unchanged
      expect(video1.currentTime).toBe(10);
      expect(video2.currentTime).toBe(20);
      
      // Now enable the component and verify methods work
      mediaSyncElement.disabled = false;
      
      // Test play() method again - should now work
      mediaSyncElement.play();
      
      // Both wrappers' play methods should be called
      expect(playFn1).toHaveBeenCalled();
      expect(playFn2).toHaveBeenCalled();
    });
  });
});
