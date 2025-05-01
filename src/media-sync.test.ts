import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaSync } from "./register";
import { CustomEventNames } from "./constants";

// Mock the utils module to make debounce work synchronously in tests
vi.mock("./utils", async (importOriginal) => {
  const originalModule = await importOriginal<typeof import("./utils")>();
  return {
    ...originalModule,
    debounce: vi.fn().mockImplementation((fn) => fn),
    Logger: {
      debug: vi.fn(),
      error: vi.fn()
    }
  };
});

// Enable fake timers for setTimeout
vi.useFakeTimers();

describe("MediaSync", () => {
  let mediaSyncElement: MediaSync;
  let video1: HTMLVideoElement;
  let video2: HTMLVideoElement;
  let wrapper1: any;
  let wrapper2: any;
  
  beforeEach(() => {
    // Create MediaSync element
    mediaSyncElement = new MediaSync();
    
    // Mock HTMLMediaElement prototype methods
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      writable: true,
      value: vi.fn().mockResolvedValue(undefined)
    });
    
    Object.defineProperty(HTMLMediaElement.prototype, 'pause', {
      configurable: true,
      writable: true,
      value: vi.fn()
    });
    
    // Create two video elements
    video1 = document.createElement("video");
    video2 = document.createElement("video");
    
    // Initialize the media-sync element with the videos
    [wrapper1, wrapper2] = mediaSyncElement.initialize([video1, video2]);
    
    // Reset all mocks before each test
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("initialization", () => {
    it("custom element uses MediaSync backing class", () => {
      mediaSyncElement = document.createElement("media-sync");
      expect(mediaSyncElement).toBeInstanceOf(MediaSync);
    });

    it("custom element registry contains media-sync element", () => {
      const mediaSync = customElements.get("media-sync");
      expect(mediaSync).toBeDefined();
      expect(mediaSync?.name).toBe("MediaSync");
    });
  });

  describe("Event-based synchronization", () => {
    it("should sync play to other elements when one element triggers play", () => {
      const wrapper1PlaySpy = vi.spyOn(wrapper1, 'play');
      const wrapper2PlaySpy = vi.spyOn(wrapper2, 'play');
      
      // Simulate a play event from wrapper1
      wrapper1.dispatchEvent(new CustomEvent(CustomEventNames.play));
      
      expect(wrapper1PlaySpy).not.toHaveBeenCalled();
      expect(wrapper2PlaySpy).toHaveBeenCalled();
    });
    
    it("should sync pause to other elements when one element triggers pause", () => {
      const wrapper1PauseSpy = vi.spyOn(wrapper1, 'pause');
      const wrapper2PauseSpy = vi.spyOn(wrapper2, 'pause');
      
      // Simulate a pause event from wrapper1
      wrapper1.dispatchEvent(new CustomEvent(CustomEventNames.pause));
      
      expect(wrapper1PauseSpy).not.toHaveBeenCalled();
      expect(wrapper2PauseSpy).toHaveBeenCalled();
    });
    
    it("should sync playback rate to other elements when one element changes rate", () => {
      const wrapper1RateSetter = vi.fn();
      Object.defineProperty(wrapper1, 'playbackRate', {
        set: wrapper1RateSetter
      });

      const wrapper2RateSetter = vi.fn();
      Object.defineProperty(wrapper2, 'playbackRate', {
        set: wrapper2RateSetter
      });
      
      // Simulate a ratechange event from wrapper1
      wrapper1.dispatchEvent(new CustomEvent(CustomEventNames.ratechange, {
        detail: { playbackRate: 1.5 }
      }));
      
      expect(wrapper1RateSetter).not.toHaveBeenCalledWith(1.5);
      expect(wrapper2RateSetter).toHaveBeenCalledWith(1.5);
    });
    
    it("should sync seeking to other elements when one element seeks", () => {
      // Spy on wrapper's currentTime setter
      const wrapper1TimeSetter = vi.fn();
      Object.defineProperty(wrapper1, 'currentTime', {
        set: wrapper1TimeSetter
      });

      const wrapper2TimeSetter = vi.fn();
      Object.defineProperty(wrapper2, 'currentTime', {
        set: wrapper2TimeSetter
      });
      
      // Simulate a user seeking event from wrapper1 with currentTime in detail
      wrapper1.dispatchEvent(new CustomEvent(CustomEventNames.user.seeking, {
        detail: { currentTime: 15.5 }
      }));
      
      // Run all timers to handle the debounced seeking
      vi.runAllTimers();
      
      // Expect wrapper2's currentTime to be set to the time in the event detail
      expect(wrapper1TimeSetter).not.toHaveBeenCalled();
      expect(wrapper2TimeSetter).toHaveBeenCalledWith(15.5);
    });
  });

  describe("Direct API control", () => {
    it("should play all media elements when the MediaSync play() is called", async () => {
      // Spy on wrapper play methods
      const wrapper1PlaySpy = vi.spyOn(wrapper1, 'play');
      const wrapper2PlaySpy = vi.spyOn(wrapper2, 'play');
      const wrapper1SuppressSpy = vi.spyOn(wrapper1, 'suppressEventType');
      const wrapper2SuppressSpy = vi.spyOn(wrapper2, 'suppressEventType');
      const wrapper1EnableSpy = vi.spyOn(wrapper1, 'enableEventType');
      const wrapper2EnableSpy = vi.spyOn(wrapper2, 'enableEventType');
      
      // Call the MediaSync play method
      await mediaSyncElement.play();
      
      // Expect event suppression to be called for both wrappers
      expect(wrapper1SuppressSpy).toHaveBeenCalledWith(CustomEventNames.play);
      expect(wrapper2SuppressSpy).toHaveBeenCalledWith(CustomEventNames.play);
      
      // Expect both wrappers' play methods to be called
      expect(wrapper1PlaySpy).toHaveBeenCalled();
      expect(wrapper2PlaySpy).toHaveBeenCalled();
      
      // Expect event re-enabling to NOT be called yet (due to setTimeout)
      expect(wrapper1EnableSpy).not.toHaveBeenCalled();
      expect(wrapper2EnableSpy).not.toHaveBeenCalled();
      
      // Run all timers to trigger the setTimeout callback
      vi.runAllTimers();
      
      // Now expect event re-enabling to have been called
      expect(wrapper1EnableSpy).toHaveBeenCalledWith(CustomEventNames.play);
      expect(wrapper2EnableSpy).toHaveBeenCalledWith(CustomEventNames.play);
    });
    
    it("should pause all media elements when the MediaSync pause() is called", () => {
      // Spy on wrapper pause methods
      const wrapper1PauseSpy = vi.spyOn(wrapper1, 'pause');
      const wrapper2PauseSpy = vi.spyOn(wrapper2, 'pause');
      const wrapper1SuppressSpy = vi.spyOn(wrapper1, 'suppressEventType');
      const wrapper2SuppressSpy = vi.spyOn(wrapper2, 'suppressEventType');
      const wrapper1EnableSpy = vi.spyOn(wrapper1, 'enableEventType');
      const wrapper2EnableSpy = vi.spyOn(wrapper2, 'enableEventType');
      
      // Call the MediaSync pause method
      mediaSyncElement.pause();
      
      // Expect event suppression to be called for both wrappers
      expect(wrapper1SuppressSpy).toHaveBeenCalledWith(CustomEventNames.pause);
      expect(wrapper2SuppressSpy).toHaveBeenCalledWith(CustomEventNames.pause);
      
      // Expect both wrappers' pause methods to be called
      expect(wrapper1PauseSpy).toHaveBeenCalled();
      expect(wrapper2PauseSpy).toHaveBeenCalled();
      
      // Expect event re-enabling to NOT be called yet
      expect(wrapper1EnableSpy).not.toHaveBeenCalled();
      expect(wrapper2EnableSpy).not.toHaveBeenCalled();
      
      // Run the timer to trigger the setTimeout callback
      vi.runAllTimers();
      
      // Now expect event re-enabling to have been called
      expect(wrapper1EnableSpy).toHaveBeenCalledWith(CustomEventNames.pause);
      expect(wrapper2EnableSpy).toHaveBeenCalledWith(CustomEventNames.pause);
    });

    it("should get the currentTime from the main media element", () => {
      // Mock the currentTime getter on wrapper1 (main element)
      Object.defineProperty(wrapper1, 'currentTime', {
        get: vi.fn().mockReturnValue(42.5),
      });
      
      // Mock the currentTime getter on wrapper2 (secondary element)
      Object.defineProperty(wrapper2, 'currentTime', {
        get: vi.fn().mockReturnValue(30.0),
      });
      
      // Get the currentTime from MediaSync
      const time = mediaSyncElement.currentTime;
      
      // Expect the time to match the main element's time
      expect(time).toBe(42.5);
    });

    it("should synchronize all media elements when currentTime is set", () => {
      // Spy on wrapper's currentTime setters
      const wrapper1TimeSetter = vi.fn();
      const wrapper2TimeSetter = vi.fn();
      
      Object.defineProperty(wrapper1, 'currentTime', {
        set: wrapper1TimeSetter
      });
      
      Object.defineProperty(wrapper2, 'currentTime', {
        set: wrapper2TimeSetter
      });
      
      // Set the currentTime on MediaSync
      mediaSyncElement.currentTime = 35.5;
      
      // Run all timers to handle any debounced seeking
      vi.runAllTimers();
      
      // Expect both wrappers to have their currentTime set
      expect(wrapper1TimeSetter).toHaveBeenCalledWith(35.5);
      expect(wrapper2TimeSetter).toHaveBeenCalledWith(35.5);
    });

    it("should get the playbackRate from the main media element", () => {
      // Mock the playbackRate getter on wrapper1 (main element)
      Object.defineProperty(wrapper1, 'playbackRate', {
        get: vi.fn().mockReturnValue(1.5),
      });
      
      // Mock the playbackRate getter on wrapper2 (secondary element)
      Object.defineProperty(wrapper2, 'playbackRate', {
        get: vi.fn().mockReturnValue(1.0),
      });
      
      // Get the playbackRate from MediaSync
      const rate = mediaSyncElement.playbackRate;
      
      // Expect the rate to match the main element's rate
      expect(rate).toBe(1.5);
    });

    it("should synchronize all media elements when playbackRate is set", () => {
      // Spy on wrapper's playbackRate setters
      const wrapper1RateSetter = vi.fn();
      const wrapper2RateSetter = vi.fn();
      const wrapper1SuppressSpy = vi.spyOn(wrapper1, 'suppressEventType');
      const wrapper2SuppressSpy = vi.spyOn(wrapper2, 'suppressEventType');
      const wrapper1EnableSpy = vi.spyOn(wrapper1, 'enableEventType');
      const wrapper2EnableSpy = vi.spyOn(wrapper2, 'enableEventType');
      
      Object.defineProperty(wrapper1, 'playbackRate', {
        set: wrapper1RateSetter
      });
      
      Object.defineProperty(wrapper2, 'playbackRate', {
        set: wrapper2RateSetter
      });
      
      // Set the playbackRate on MediaSync
      mediaSyncElement.playbackRate = 2.0;
      
      // Expect event suppression to be called for both wrappers
      expect(wrapper1SuppressSpy).toHaveBeenCalledWith(CustomEventNames.ratechange);
      expect(wrapper2SuppressSpy).toHaveBeenCalledWith(CustomEventNames.ratechange);
      
      // Expect both wrappers to have their playbackRate set
      expect(wrapper1RateSetter).toHaveBeenCalledWith(2.0);
      expect(wrapper2RateSetter).toHaveBeenCalledWith(2.0);
      
      // Expect event re-enabling to NOT be called yet (due to setTimeout)
      expect(wrapper1EnableSpy).not.toHaveBeenCalled();
      expect(wrapper2EnableSpy).not.toHaveBeenCalled();
      
      // Run all timers to trigger the setTimeout callback
      vi.runAllTimers();
      
      // Now expect event re-enabling to have been called
      expect(wrapper1EnableSpy).toHaveBeenCalledWith(CustomEventNames.ratechange);
      expect(wrapper2EnableSpy).toHaveBeenCalledWith(CustomEventNames.ratechange);
    });
  });
  
  describe("seeking synchronization edge cases", () => {
    it("should prevent infinite loops during multiple seeking events", () => {
      // Spy on currentTime setter of the second wrapper
      const wrapper1TimeSetter = vi.fn();
      Object.defineProperty(wrapper1, 'currentTime', {
        set: wrapper1TimeSetter
      });

      const wrapper2TimeSetter = vi.fn();
      Object.defineProperty(wrapper2, 'currentTime', {
        set: wrapper2TimeSetter
      });
      
      // Trigger multiple seeking events in quick succession
      for (let i = 0; i < 5; i++) {
        // Simulate a user seeking event from wrapper1 with different times
        wrapper1.dispatchEvent(new CustomEvent(CustomEventNames.user.seeking, {
          detail: { currentTime: i * 10 }
        }));
      }
      
      // Run all timers to handle the debounced seeking
      vi.runAllTimers();
      
      // Verify that wrapper1's currentTime was not set
      expect(wrapper1TimeSetter).not.toHaveBeenCalled(); // Final value (4 * 10)
      
      // Verify that wrapper2's currentTime was only set to the final value
      expect(wrapper2TimeSetter).toHaveBeenCalledWith(40); // Final value (4 * 10)
      
      // Verify that multiple rapid seek events only result in a single sync
      // The last event's time (40) should be used for synchronization
      expect(wrapper2TimeSetter).toHaveBeenCalledTimes(1);
    });
  });
});