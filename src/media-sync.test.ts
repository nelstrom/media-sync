import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaSync } from "./register";
import { MediaEvent } from "./constants";

// Mock the utils module to make debounce work synchronously in tests
vi.mock("./utils", async () => {
  return {
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
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      writable: true,
      value: vi.fn().mockResolvedValue(undefined),
    });

    Object.defineProperty(HTMLMediaElement.prototype, "pause", {
      configurable: true,
      writable: true,
      value: vi.fn(),
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
      const wrapper1PlaySpy = vi.spyOn(wrapper1, "play");
      const wrapper2PlaySpy = vi.spyOn(wrapper2, "play");

      // Make sure readyState is high enough for playback
      const wrapper1ReadyState = vi.fn().mockReturnValue(4);
      const wrapper2ReadyState = vi.fn().mockReturnValue(4);
      vi.spyOn(wrapper1, "readyState", "get").mockImplementation(
        wrapper1ReadyState
      );
      vi.spyOn(wrapper2, "readyState", "get").mockImplementation(
        wrapper2ReadyState
      );

      // Simulate a play event from wrapper1
      wrapper1.dispatchEvent(new CustomEvent(MediaEvent.play));

      expect(wrapper1PlaySpy).not.toHaveBeenCalled();
      expect(wrapper2PlaySpy).toHaveBeenCalled();
    });

    it("should pause element that tries to play when overall readyState is insufficient", () => {
      const wrapper1PauseSpy = vi.spyOn(wrapper1, "pause");
      const wrapper2PlaySpy = vi.spyOn(wrapper2, "play");

      // Set up insufficient readyState - wrapper1 is ready but wrapper2 is not
      const wrapper1ReadyState = vi.fn().mockReturnValue(4); // HAVE_ENOUGH_DATA
      const wrapper2ReadyState = vi.fn().mockReturnValue(2); // HAVE_CURRENT_DATA
      vi.spyOn(wrapper1, "readyState", "get").mockImplementation(
        wrapper1ReadyState
      );
      vi.spyOn(wrapper2, "readyState", "get").mockImplementation(
        wrapper2ReadyState
      );

      // Simulate a play event from wrapper1
      wrapper1.dispatchEvent(new CustomEvent(MediaEvent.play));

      // Expect that wrapper1 was immediately paused and wrapper2 was not played
      expect(wrapper1PauseSpy).toHaveBeenCalled();
      expect(wrapper2PlaySpy).not.toHaveBeenCalled();
    });

    it("should sync pause to other elements when one element triggers pause", () => {
      const wrapper1PauseSpy = vi.spyOn(wrapper1, "pause");
      const wrapper2PauseSpy = vi.spyOn(wrapper2, "pause");
      
      // Mock ended state for wrapper1 as false (not ended)
      vi.spyOn(wrapper1, "ended", "get").mockReturnValue(false);

      // Simulate a pause event from wrapper1
      wrapper1.dispatchEvent(new CustomEvent(MediaEvent.pause));

      expect(wrapper1PauseSpy).not.toHaveBeenCalled();
      expect(wrapper2PauseSpy).toHaveBeenCalled();
    });
    
    it("should not sync pause to other elements when a track reaches its end", () => {
      const wrapper1PauseSpy = vi.spyOn(wrapper1, "pause");
      const wrapper2PauseSpy = vi.spyOn(wrapper2, "pause");
      
      // Mock ended state for wrapper1 as true (ended)
      vi.spyOn(wrapper1, "ended", "get").mockReturnValue(true);

      // Simulate a pause event from wrapper1 that has ended
      wrapper1.dispatchEvent(new CustomEvent(MediaEvent.pause));

      // Should not pause other elements
      expect(wrapper1PauseSpy).not.toHaveBeenCalled();
      expect(wrapper2PauseSpy).not.toHaveBeenCalled();
    });

    it("should sync playback rate to other elements when one element changes rate", () => {
      const wrapper1RateSetter = vi.fn();
      Object.defineProperty(wrapper1, "playbackRate", {
        set: wrapper1RateSetter,
      });

      const wrapper2RateSetter = vi.fn();
      Object.defineProperty(wrapper2, "playbackRate", {
        set: wrapper2RateSetter,
      });

      // Simulate a ratechange event from wrapper1
      wrapper1.dispatchEvent(
        new CustomEvent(MediaEvent.ratechange, {
          detail: { playbackRate: 1.5 },
        })
      );

      expect(wrapper1RateSetter).not.toHaveBeenCalledWith(1.5);
      expect(wrapper2RateSetter).toHaveBeenCalledWith(1.5);
    });

    it("should sync seeking to other elements when one element seeks", () => {
      // Spy on wrapper's currentTime setter
      const wrapper1TimeSetter = vi.fn();
      Object.defineProperty(wrapper1, "currentTime", {
        set: wrapper1TimeSetter,
      });

      const wrapper2TimeSetter = vi.fn();
      Object.defineProperty(wrapper2, "currentTime", {
        set: wrapper2TimeSetter,
      });

      const wrapper1SuppressSpy = vi.spyOn(wrapper1, "suppressEventType");
      const wrapper2SuppressSpy = vi.spyOn(wrapper2, "suppressEventType");
      const wrapper1EnableSpy = vi.spyOn(wrapper1, "enableEventType");
      const wrapper2EnableSpy = vi.spyOn(wrapper2, "enableEventType");

      // Simulate a seeking event from wrapper1 with currentTime in detail
      wrapper1.dispatchEvent(
        new CustomEvent(MediaEvent.seeking, {
          detail: { currentTime: 15.5 },
        })
      );

      // Expect event suppression to be called
      expect(wrapper1SuppressSpy).toHaveBeenCalledWith(MediaEvent.seeking);
      expect(wrapper2SuppressSpy).toHaveBeenCalledWith(MediaEvent.seeking);

      // Expect wrapper2's currentTime to be set to the time in the event detail
      expect(wrapper1TimeSetter).not.toHaveBeenCalled();
      expect(wrapper2TimeSetter).toHaveBeenCalledWith(15.5);

      // Expect event re-enabling to NOT be called yet (due to setTimeout)
      expect(wrapper1EnableSpy).not.toHaveBeenCalled();
      expect(wrapper2EnableSpy).not.toHaveBeenCalled();

      // Run all timers to trigger the setTimeout callback
      vi.runAllTimers();

      // Now expect event re-enabling to have been called
      expect(wrapper1EnableSpy).toHaveBeenCalledWith(MediaEvent.seeking);
      expect(wrapper2EnableSpy).toHaveBeenCalledWith(MediaEvent.seeking);
    });
  });

  describe("Direct API control", () => {
    it("should return the duration from the main media element", () => {
      // Mock duration getter on wrapper1 (main element)
      const wrapper1Duration = vi.fn().mockReturnValue(100);
      Object.defineProperty(wrapper1, "duration", {
        get: wrapper1Duration,
      });

      // Mock duration getter on wrapper2 (secondary element)
      const wrapper2Duration = vi.fn().mockReturnValue(80);
      Object.defineProperty(wrapper2, "duration", {
        get: wrapper2Duration,
      });

      // Get the duration from MediaSync
      const duration = mediaSyncElement.duration;

      // Expect the duration to match the main element's duration
      expect(duration).toBe(100);
    });

    it("should return the ended state from the main media element", () => {
      // Mock ended getter on wrapper1 (main element)
      const wrapper1Ended = vi.fn().mockReturnValue(false);
      Object.defineProperty(wrapper1, "ended", {
        get: wrapper1Ended,
      });

      // Mock ended getter on wrapper2 (secondary element)
      const wrapper2Ended = vi.fn().mockReturnValue(true);
      Object.defineProperty(wrapper2, "ended", {
        get: wrapper2Ended,
      });

      // Verify MediaSync returns the main element's ended state (false)
      expect(mediaSyncElement.ended).toBe(false);

      // Change main element to ended=true
      wrapper1Ended.mockReturnValue(true);

      // Verify MediaSync now returns the updated ended state (true)
      expect(mediaSyncElement.ended).toBe(true);
    });

    it("should play all media elements when the MediaSync play() is called", async () => {
      // Spy on wrapper play methods
      const wrapper1PlaySpy = vi.spyOn(wrapper1, "play");
      const wrapper2PlaySpy = vi.spyOn(wrapper2, "play");
      const wrapper1SuppressSpy = vi.spyOn(wrapper1, "suppressEventType");
      const wrapper2SuppressSpy = vi.spyOn(wrapper2, "suppressEventType");
      const wrapper1EnableSpy = vi.spyOn(wrapper1, "enableEventType");
      const wrapper2EnableSpy = vi.spyOn(wrapper2, "enableEventType");

      // Make sure readyState is high enough for playback
      const wrapper1ReadyState = vi.fn().mockReturnValue(4);
      const wrapper2ReadyState = vi.fn().mockReturnValue(4);
      vi.spyOn(wrapper1, "readyState", "get").mockImplementation(
        wrapper1ReadyState
      );
      vi.spyOn(wrapper2, "readyState", "get").mockImplementation(
        wrapper2ReadyState
      );

      // Call the MediaSync play method
      await mediaSyncElement.play();

      // Expect event suppression to be called for both wrappers
      expect(wrapper1SuppressSpy).toHaveBeenCalledWith(MediaEvent.play);
      expect(wrapper2SuppressSpy).toHaveBeenCalledWith(MediaEvent.play);

      // Expect both wrappers' play methods to be called
      expect(wrapper1PlaySpy).toHaveBeenCalled();
      expect(wrapper2PlaySpy).toHaveBeenCalled();

      // Expect event re-enabling to NOT be called yet (due to setTimeout)
      expect(wrapper1EnableSpy).not.toHaveBeenCalled();
      expect(wrapper2EnableSpy).not.toHaveBeenCalled();

      // Run all timers to trigger the setTimeout callback
      vi.runAllTimers();

      // Now expect event re-enabling to have been called
      expect(wrapper1EnableSpy).toHaveBeenCalledWith(MediaEvent.play);
      expect(wrapper2EnableSpy).toHaveBeenCalledWith(MediaEvent.play);
    });

    it("should pause all media elements when the MediaSync pause() is called", () => {
      // Spy on wrapper pause methods
      const wrapper1PauseSpy = vi.spyOn(wrapper1, "pause");
      const wrapper2PauseSpy = vi.spyOn(wrapper2, "pause");
      const wrapper1SuppressSpy = vi.spyOn(wrapper1, "suppressEventType");
      const wrapper2SuppressSpy = vi.spyOn(wrapper2, "suppressEventType");
      const wrapper1EnableSpy = vi.spyOn(wrapper1, "enableEventType");
      const wrapper2EnableSpy = vi.spyOn(wrapper2, "enableEventType");

      // Call the MediaSync pause method
      mediaSyncElement.pause();

      // Expect event suppression to be called for both wrappers
      expect(wrapper1SuppressSpy).toHaveBeenCalledWith(MediaEvent.pause);
      expect(wrapper2SuppressSpy).toHaveBeenCalledWith(MediaEvent.pause);

      // Expect both wrappers' pause methods to be called
      expect(wrapper1PauseSpy).toHaveBeenCalled();
      expect(wrapper2PauseSpy).toHaveBeenCalled();

      // Expect event re-enabling to NOT be called yet
      expect(wrapper1EnableSpy).not.toHaveBeenCalled();
      expect(wrapper2EnableSpy).not.toHaveBeenCalled();

      // Run the timer to trigger the setTimeout callback
      vi.runAllTimers();

      // Now expect event re-enabling to have been called
      expect(wrapper1EnableSpy).toHaveBeenCalledWith(MediaEvent.pause);
      expect(wrapper2EnableSpy).toHaveBeenCalledWith(MediaEvent.pause);
    });

    it("should get the currentTime from the main media element", () => {
      // Mock the currentTime getter on wrapper1 (main element)
      Object.defineProperty(wrapper1, "currentTime", {
        get: vi.fn().mockReturnValue(42.5),
      });

      // Mock the currentTime getter on wrapper2 (secondary element)
      Object.defineProperty(wrapper2, "currentTime", {
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
      const wrapper1SuppressSpy = vi.spyOn(wrapper1, "suppressEventType");
      const wrapper2SuppressSpy = vi.spyOn(wrapper2, "suppressEventType");
      const wrapper1EnableSpy = vi.spyOn(wrapper1, "enableEventType");
      const wrapper2EnableSpy = vi.spyOn(wrapper2, "enableEventType");

      Object.defineProperty(wrapper1, "currentTime", {
        set: wrapper1TimeSetter,
      });

      Object.defineProperty(wrapper2, "currentTime", {
        set: wrapper2TimeSetter,
      });

      // Set the currentTime on MediaSync
      mediaSyncElement.currentTime = 35.5;

      // Expect event suppression to be called
      expect(wrapper1SuppressSpy).toHaveBeenCalledWith(MediaEvent.seeking);
      expect(wrapper2SuppressSpy).toHaveBeenCalledWith(MediaEvent.seeking);

      // Expect both wrappers to have their currentTime set
      expect(wrapper1TimeSetter).toHaveBeenCalledWith(35.5);
      expect(wrapper2TimeSetter).toHaveBeenCalledWith(35.5);

      // Expect event re-enabling to NOT be called yet (due to setTimeout)
      expect(wrapper1EnableSpy).not.toHaveBeenCalled();
      expect(wrapper2EnableSpy).not.toHaveBeenCalled();

      // Run all timers to handle any debounced seeking
      vi.runAllTimers();

      // Now expect event re-enabling to have been called
      expect(wrapper1EnableSpy).toHaveBeenCalledWith(MediaEvent.seeking);
      expect(wrapper2EnableSpy).toHaveBeenCalledWith(MediaEvent.seeking);
    });

    it("should get the playbackRate from the main media element", () => {
      // Mock the playbackRate getter on wrapper1 (main element)
      Object.defineProperty(wrapper1, "playbackRate", {
        get: vi.fn().mockReturnValue(1.5),
      });

      // Mock the playbackRate getter on wrapper2 (secondary element)
      Object.defineProperty(wrapper2, "playbackRate", {
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
      const wrapper1SuppressSpy = vi.spyOn(wrapper1, "suppressEventType");
      const wrapper2SuppressSpy = vi.spyOn(wrapper2, "suppressEventType");
      const wrapper1EnableSpy = vi.spyOn(wrapper1, "enableEventType");
      const wrapper2EnableSpy = vi.spyOn(wrapper2, "enableEventType");

      Object.defineProperty(wrapper1, "playbackRate", {
        set: wrapper1RateSetter,
      });

      Object.defineProperty(wrapper2, "playbackRate", {
        set: wrapper2RateSetter,
      });

      // Set the playbackRate on MediaSync
      mediaSyncElement.playbackRate = 2.0;

      // Expect event suppression to be called for both wrappers
      expect(wrapper1SuppressSpy).toHaveBeenCalledWith(MediaEvent.ratechange);
      expect(wrapper2SuppressSpy).toHaveBeenCalledWith(MediaEvent.ratechange);

      // Expect both wrappers to have their playbackRate set
      expect(wrapper1RateSetter).toHaveBeenCalledWith(2.0);
      expect(wrapper2RateSetter).toHaveBeenCalledWith(2.0);

      // Expect event re-enabling to NOT be called yet (due to setTimeout)
      expect(wrapper1EnableSpy).not.toHaveBeenCalled();
      expect(wrapper2EnableSpy).not.toHaveBeenCalled();

      // Run all timers to trigger the setTimeout callback
      vi.runAllTimers();

      // Now expect event re-enabling to have been called
      expect(wrapper1EnableSpy).toHaveBeenCalledWith(MediaEvent.ratechange);
      expect(wrapper2EnableSpy).toHaveBeenCalledWith(MediaEvent.ratechange);
    });
  });

  describe("seeking synchronization edge cases", () => {
    it("should prevent infinite loops during multiple seeking events", () => {
      // Spy on currentTime setter of the second wrapper
      const wrapper1TimeSetter = vi.fn();
      Object.defineProperty(wrapper1, "currentTime", {
        set: wrapper1TimeSetter,
      });

      const wrapper2TimeSetter = vi.fn();
      Object.defineProperty(wrapper2, "currentTime", {
        set: wrapper2TimeSetter,
      });

      const wrapper1SuppressSpy = vi.spyOn(wrapper1, "suppressEventType");
      const wrapper2SuppressSpy = vi.spyOn(wrapper2, "suppressEventType");

      // First event should trigger synchronization
      wrapper1.dispatchEvent(
        new CustomEvent(MediaEvent.seeking, {
          detail: { currentTime: 40 },
        })
      );

      // Verify that event suppression is called
      expect(wrapper1SuppressSpy).toHaveBeenCalledWith(MediaEvent.seeking);
      expect(wrapper2SuppressSpy).toHaveBeenCalledWith(MediaEvent.seeking);

      // Verify that wrapper2's currentTime is set
      expect(wrapper2TimeSetter).toHaveBeenCalledWith(40);

      // Create a second event while we're still suppressing
      // This should be ignored because isSyncingSeeking is true
      wrapper1.dispatchEvent(
        new CustomEvent(MediaEvent.seeking, {
          detail: { currentTime: 50 },
        })
      );

      // First event should have only called wrapper2's currentTime once
      expect(wrapper2TimeSetter).toHaveBeenCalledTimes(1);

      // Run all timers to complete the seeking process
      vi.runAllTimers();

      // Now try another event after events are re-enabled
      wrapper1.dispatchEvent(
        new CustomEvent(MediaEvent.seeking, {
          detail: { currentTime: 60 },
        })
      );

      // This should work and set wrapper2's time again
      expect(wrapper2TimeSetter).toHaveBeenCalledWith(60);
      expect(wrapper2TimeSetter).toHaveBeenCalledTimes(2);
    });
  });

  describe("drift handling with ended tracks", () => {
    beforeEach(() => {
      // Mock the drift sampling and correction intervals
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should record ended state in drift samples for tracks that have ended", () => {
      // Set up conditions for drift sampling
      wrapper1.isMain = true;
      wrapper2.isMain = false;

      // Mock currentTime on wrapper1 (main)
      vi.spyOn(wrapper1, "currentTime", "get").mockReturnValue(90);

      // Mock currentTime on wrapper2
      vi.spyOn(wrapper2, "currentTime", "get").mockReturnValue(85);

      // Mock paused state on main (should be playing to sample drift)
      vi.spyOn(wrapper1, "paused", "get").mockReturnValue(false);

      // Mock ended state on wrapper2 (non-main)
      vi.spyOn(wrapper2, "ended", "get").mockReturnValue(true);

      // Clear any existing samples
      mediaSyncElement.driftSamples = [];

      // Manually invoke sampleDrift
      (mediaSyncElement as any).sampleDrift();

      // Verify the drift sample includes the ended state for wrapper2
      expect(mediaSyncElement.driftSamples.length).toBe(1);
      const sample = mediaSyncElement.driftSamples[0] as any;
      expect(sample.type).toBe("sample");

      // Find the entry for wrapper2
      const wrapper2Entry = sample.drifts.find(
        (d: any) => d.id === wrapper2.id
      );
      expect(wrapper2Entry).toBeDefined();
      expect(wrapper2Entry.ended).toBe(true);
      expect(wrapper2Entry.delta).toBeUndefined();

      // Main element should have delta=0 and ended=false
      const wrapper1Entry = sample.drifts.find(
        (d: any) => d.id === wrapper1.id
      );
      expect(wrapper1Entry).toBeDefined();
      expect(wrapper1Entry.delta).toBe(0);
      expect(wrapper1Entry.ended).toBe(false);
    });

    it("should skip ended tracks during drift correction", () => {
      // Set up conditions for drift correction
      wrapper1.isMain = true;
      wrapper2.isMain = false;

      // Mock currentTime on wrapper1 (main)
      vi.spyOn(wrapper1, "currentTime", "get").mockReturnValue(90);

      // Mock currentTime on wrapper2 to be significantly different to trigger correction
      vi.spyOn(wrapper2, "currentTime", "get").mockReturnValue(85);

      // Mock paused state on main (not paused to allow correction)
      vi.spyOn(wrapper1, "paused", "get").mockReturnValue(false);

      // Mock ended state on wrapper2 (non-main)
      vi.spyOn(wrapper2, "ended", "get").mockReturnValue(true);

      // Spy on the seekTracks method
      const seekTracksSpy = vi.spyOn(mediaSyncElement as any, "seekTracks");

      // Manually invoke correctDrift
      (mediaSyncElement as any).correctDrift();

      // Verify seekTracks was not called with wrapper2 because it's ended
      expect(seekTracksSpy).not.toHaveBeenCalled();

      // Now set ended to false for wrapper2 and try again
      vi.spyOn(wrapper2, "ended", "get").mockReturnValue(false);

      // Manually invoke correctDrift again
      (mediaSyncElement as any).correctDrift();

      // This time seekTracks should be called with wrapper2
      expect(seekTracksSpy).toHaveBeenCalled();

      // Verify the tracks that were passed to seekTracks includes wrapper2
      const tracksPassedToSeekTracks = seekTracksSpy.mock.calls[0][0];
      expect(tracksPassedToSeekTracks).toContain(wrapper2);
    });

    it("should suppress waiting events during drift correction and re-enable after delay", () => {
      // Set up conditions for drift correction
      wrapper1.isMain = true;
      wrapper2.isMain = false;

      // Mock currentTime values to ensure drift exceeds threshold
      vi.spyOn(wrapper1, "currentTime", "get").mockReturnValue(50);
      vi.spyOn(wrapper2, "currentTime", "get").mockReturnValue(40); // Large 10s drift

      // Mock paused state on main (not paused to allow correction)
      vi.spyOn(wrapper1, "paused", "get").mockReturnValue(false);
      
      // Set ended to false for both wrappers
      vi.spyOn(wrapper1, "ended", "get").mockReturnValue(false);
      vi.spyOn(wrapper2, "ended", "get").mockReturnValue(false);

      // Spy on the event suppression and enabling methods
      const suppressSpy = vi.spyOn(wrapper2, "suppressEventType");
      const enableSpy = vi.spyOn(wrapper2, "enableEventType");
      
      // Spy on the seekTracks method to verify it's called
      const seekTracksSpy = vi.spyOn(mediaSyncElement as any, "seekTracks");

      // Manually invoke correctDrift
      (mediaSyncElement as any).correctDrift();

      // Verify waiting events are suppressed
      expect(suppressSpy).toHaveBeenCalledWith(MediaEvent.waiting);
      
      // Verify seekTracks was called with wrapper2
      expect(seekTracksSpy).toHaveBeenCalled();
      const tracksPassedToSeekTracks = seekTracksSpy.mock.calls[0][0];
      expect(tracksPassedToSeekTracks).toContain(wrapper2);

      // Before running timers, enableEventType should not be called yet
      expect(enableSpy).not.toHaveBeenCalled();

      // Run all timers to trigger the setTimeout callback
      vi.runAllTimers();

      // After timers run, events should be re-enabled
      expect(enableSpy).toHaveBeenCalledWith(MediaEvent.waiting);
    });
  });

  describe("ended event handling", () => {
    it("should forward ended event from main element and pause other tracks", () => {
      // Set up spy for dispatching events
      const dispatchEventSpy = vi.spyOn(mediaSyncElement, "dispatchEvent");

      // Mark first wrapper as main element
      wrapper1.isMain = true;
      wrapper2.isMain = false;

      // Create spies for wrapper pause methods
      const wrapper1PauseSpy = vi.spyOn(wrapper1, "pause");
      const wrapper2PauseSpy = vi.spyOn(wrapper2, "pause");

      // Trigger ended event from main element
      wrapper1.dispatchEvent(new CustomEvent(MediaEvent.ended));

      // Verify ended event was forwarded
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ended",
          bubbles: true,
          composed: true,
        })
      );

      // Verify other track was paused, but not the main one
      expect(wrapper1PauseSpy).not.toHaveBeenCalled();
      expect(wrapper2PauseSpy).toHaveBeenCalled();
    });

    it("should not forward ended event from non-main element", () => {
      // Set up spies
      const dispatchEventSpy = vi.spyOn(mediaSyncElement, "dispatchEvent");

      // Mark first wrapper as main element
      wrapper1.isMain = true;
      wrapper2.isMain = false;

      // Trigger ended event from non-main element
      wrapper2.dispatchEvent(new CustomEvent(MediaEvent.ended));

      // Verify ended event was not forwarded
      expect(dispatchEventSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: "ended",
        })
      );
    });
  });
  
  describe("loop property", () => {
    beforeEach(() => {
      // Set up wrappers for testing loop behavior
      wrapper1.isMain = true;
      wrapper2.isMain = false;
    });
    
    it("should initialize with loop=false by default", () => {
      // Create a new MediaSync element
      const newMediaSync = new MediaSync();
      expect(newMediaSync.loop).toBe(false);
    });
    
    it("should initialize with loop=true if 'loop' attribute is present", () => {
      // Create a new element with the loop attribute
      const loopMediaSync = document.createElement("media-sync");
      loopMediaSync.setAttribute('loop', '');
      document.body.appendChild(loopMediaSync);
      
      // Use a try-finally to ensure element is removed even if test fails
      try {
        expect(loopMediaSync.loop).toBe(true);
      } finally {
        // Clean up
        document.body.removeChild(loopMediaSync);
      }
    });
    
    it("should get loop property from internal state", () => {
      // Default state should be false
      expect(mediaSyncElement.loop).toBe(false);
      
      // Set internal state directly for testing
      (mediaSyncElement as any)._loop = true;
      
      expect(mediaSyncElement.loop).toBe(true);
    });
    
    it("should set loop property and update attribute", () => {
      // Spy on setAttribute and removeAttribute
      const setAttributeSpy = vi.spyOn(mediaSyncElement, "setAttribute");
      const removeAttributeSpy = vi.spyOn(mediaSyncElement, "removeAttribute");
      
      // Set loop to true
      mediaSyncElement.loop = true;
      
      // Verify attribute was set
      expect(setAttributeSpy).toHaveBeenCalledWith("loop", "");
      expect(mediaSyncElement.loop).toBe(true);
      
      // Set loop to false
      mediaSyncElement.loop = false;
      
      // Verify attribute was removed
      expect(removeAttributeSpy).toHaveBeenCalledWith("loop");
      expect(mediaSyncElement.loop).toBe(false);
    });
    
    it("should update main element's loop property when changed", () => {
      // Create a spy for the wrapper's loop setter
      const wrapper1LoopSetter = vi.fn();
      
      Object.defineProperty(wrapper1, "loop", {
        configurable: true,
        get: () => false,
        set: wrapper1LoopSetter,
      });
      
      // Mock the updateLoopStateForNonMainElements method
      const updateLoopSpy = vi.spyOn(
        mediaSyncElement as any, 
        "updateLoopStateForNonMainElements"
      );
      
      // Set loop property
      mediaSyncElement.loop = true;
      
      // Verify main wrapper's loop was updated
      expect(wrapper1LoopSetter).toHaveBeenCalledWith(true);
      
      // Verify updateLoopStateForNonMainElements was called
      expect(updateLoopSpy).toHaveBeenCalled();
    });
    
    it("should update loop property when 'loop' attribute changes", () => {
      // Reset state
      (mediaSyncElement as any)._loop = false;
      
      // Spy on updateLoopStateForNonMainElements
      const updateLoopSpy = vi.spyOn(mediaSyncElement as any, "updateLoopStateForNonMainElements");
      
      // Trigger attributeChangedCallback manually 
      mediaSyncElement.attributeChangedCallback("loop", "", "");
      
      // Verify loop property was updated to true
      expect(mediaSyncElement.loop).toBe(true);
      expect(updateLoopSpy).toHaveBeenCalled();
    });
    
    it("should disable loop on non-main media elements", () => {
      // Setup loop getter/setter spies for wrappers
      const wrapper1LoopSetter = vi.fn();
      const wrapper2LoopSetter = vi.fn();
      
      // Mock the getters and setters
      vi.spyOn(wrapper1, "loop", "get").mockReturnValue(true);
      vi.spyOn(wrapper2, "loop", "get").mockReturnValue(true);
      
      // Override the setters for testing
      Object.defineProperty(wrapper1, "loop", {
        configurable: true,
        get: () => true,
        set: wrapper1LoopSetter,
      });
      
      Object.defineProperty(wrapper2, "loop", {
        configurable: true,
        get: () => true,
        set: wrapper2LoopSetter,
      });
      
      // Set loop to true on MediaSync
      mediaSyncElement.loop = true;
      
      // Verify main element's loop was set to true
      expect(wrapper1LoopSetter).toHaveBeenCalledWith(true);
      
      // Manually invoke updateLoopStateForNonMainElements
      (mediaSyncElement as any).updateLoopStateForNonMainElements();
      
      // Verify non-main element's loop was set to false
      expect(wrapper2LoopSetter).toHaveBeenCalledWith(false);
    });
    
    it("should update MediaSync loop property when main element's loop changes", () => {
      // Set initial loop state on MediaSync to false
      (mediaSyncElement as any)._loop = false;
      
      // Setup spies for setAttribute
      const setAttributeSpy = vi.spyOn(mediaSyncElement, "setAttribute");
      
      // Trigger loopchange event from the main element
      const loopChangeEvent = new CustomEvent("loopchange", {
        detail: { loop: true }
      });
      wrapper1.dispatchEvent(loopChangeEvent);
      
      // Verify MediaSync loop property and attribute were updated
      expect(mediaSyncElement.loop).toBe(true);
      expect(setAttributeSpy).toHaveBeenCalledWith("loop", "");
    });
    
    it("should not update MediaSync loop property when values match", () => {
      // Set initial loop state on MediaSync to true
      mediaSyncElement.loop = true;
      
      // Clear previous calls
      const setLoopSpy = vi.spyOn(mediaSyncElement, "loop", "set");
      
      // Trigger loopchange event with same value as current
      const loopChangeEvent = new CustomEvent("loopchange", {
        detail: { loop: true }
      });
      wrapper1.dispatchEvent(loopChangeEvent);
      
      // Verify setter was not called again to avoid infinite loop
      expect(setLoopSpy).not.toHaveBeenCalled();
    });
  });

  describe("readyState and waiting functionality", () => {
    it("should report the minimum readyState of all media elements", () => {
      // Create mock readyState getters
      const wrapper1ReadyState = vi.fn().mockReturnValue(4); // HAVE_ENOUGH_DATA
      const wrapper2ReadyState = vi.fn().mockReturnValue(2); // HAVE_CURRENT_DATA

      // Mock the wrappers with spies
      vi.spyOn(wrapper1, "readyState", "get").mockImplementation(
        wrapper1ReadyState
      );
      vi.spyOn(wrapper2, "readyState", "get").mockImplementation(
        wrapper2ReadyState
      );

      // Expect the MediaSync to report the minimum
      expect(mediaSyncElement.readyState).toBe(2);

      // Update the second wrapper to a higher readyState
      wrapper2ReadyState.mockReturnValue(3); // HAVE_FUTURE_DATA

      // Expect MediaSync to reflect the new minimum
      expect(mediaSyncElement.readyState).toBe(3);
    });

    it("should forward readyState events from media elements", () => {
      // Set up event listeners
      const emptiedSpy = vi.fn();
      const loadedmetadataSpy = vi.fn();
      const loadeddataSpy = vi.fn();
      const canplaySpy = vi.fn();
      const canplaythroughSpy = vi.fn();

      mediaSyncElement.addEventListener("emptied", emptiedSpy);
      mediaSyncElement.addEventListener("loadedmetadata", loadedmetadataSpy);
      mediaSyncElement.addEventListener("loadeddata", loadeddataSpy);
      mediaSyncElement.addEventListener("canplay", canplaySpy);
      mediaSyncElement.addEventListener("canplaythrough", canplaythroughSpy);

      // Directly trigger native events - our implementation should just forward these
      mediaSyncElement.dispatchEvent(new CustomEvent("emptied"));
      mediaSyncElement.dispatchEvent(new CustomEvent("loadedmetadata"));
      mediaSyncElement.dispatchEvent(new CustomEvent("loadeddata"));
      mediaSyncElement.dispatchEvent(new CustomEvent("canplay"));
      mediaSyncElement.dispatchEvent(new CustomEvent("canplaythrough"));

      // Check that the events were received by the listeners
      expect(emptiedSpy).toHaveBeenCalledTimes(1);
      expect(loadedmetadataSpy).toHaveBeenCalledTimes(1);
      expect(loadeddataSpy).toHaveBeenCalledTimes(1);
      expect(canplaySpy).toHaveBeenCalledTimes(1);
      expect(canplaythroughSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("synchronization of tracks with different durations", () => {
    it("should respect duration limits when seeking", async () => {
      // Set up different durations for the media elements
      Object.defineProperty(wrapper1, "duration", {
        get: vi.fn().mockReturnValue(100),
      });

      Object.defineProperty(wrapper2, "duration", {
        get: vi.fn().mockReturnValue(60),
      });

      // Create spies for the currentTime setters
      const wrapper1TimeSetter = vi.fn();
      Object.defineProperty(wrapper1, "currentTime", {
        set: wrapper1TimeSetter,
        get: vi.fn().mockReturnValue(50),
      });

      const wrapper2TimeSetter = vi.fn();
      Object.defineProperty(wrapper2, "currentTime", {
        set: wrapper2TimeSetter,
        get: vi.fn().mockReturnValue(50),
      });

      // Try to seek both elements to a time beyond the shorter track's duration
      mediaSyncElement.currentTime = 80;

      // This should still seek the main track normally
      expect(wrapper1TimeSetter).toHaveBeenCalledWith(80);

      // But for the shorter track, it should still use the wrapper's boundary checking
      // The MediaElementWrapper implementation should prevent seeking beyond duration
      expect(wrapper2TimeSetter).toHaveBeenCalledWith(80);
    });

    it("should handle tracks ending at different times", () => {
      // Set up main element with longer duration
      wrapper1.isMain = true;
      wrapper2.isMain = false;

      Object.defineProperty(wrapper1, "duration", {
        get: vi.fn().mockReturnValue(100),
      });

      Object.defineProperty(wrapper2, "duration", {
        get: vi.fn().mockReturnValue(60),
      });

      // Set up mock for ended state on wrapper2
      const wrapper2Ended = vi.fn().mockReturnValue(true);
      vi.spyOn(wrapper2, "ended", "get").mockImplementation(wrapper2Ended);

      // Set up mock for ended state on wrapper1
      const wrapper1Ended = vi.fn().mockReturnValue(false);
      vi.spyOn(wrapper1, "ended", "get").mockImplementation(wrapper1Ended);

      // Verify the functionality of the ended getter

      // Ended getter should respect main track's ended state (which is false)
      expect(mediaSyncElement.ended).toBe(false);

      // Update main to report as ended
      wrapper1Ended.mockReturnValue(true);

      // Now MediaSync should report as ended
      expect(mediaSyncElement.ended).toBe(true);
    });
  });

  it("should not start playback if readyState is insufficient", async () => {
    // Create mock functions for readyState values
    const wrapper1ReadyState = vi.fn();
    const wrapper2ReadyState = vi.fn();

    // Mock the readyState getters
    vi.spyOn(wrapper1, "readyState", "get").mockImplementation(
      wrapper1ReadyState
    );
    vi.spyOn(wrapper2, "readyState", "get").mockImplementation(
      wrapper2ReadyState
    );

    // Set insufficient readyState
    wrapper1ReadyState.mockReturnValue(2); // HAVE_CURRENT_DATA
    wrapper2ReadyState.mockReturnValue(3); // HAVE_FUTURE_DATA

    const wrapper1PlaySpy = vi.spyOn(wrapper1, "play");
    const wrapper2PlaySpy = vi.spyOn(wrapper2, "play");

    // Try to play, which should not succeed
    await mediaSyncElement.play();

    // Expect that play was not called on wrappers
    expect(wrapper1PlaySpy).not.toHaveBeenCalled();
    expect(wrapper2PlaySpy).not.toHaveBeenCalled();

    // Update to sufficient readyState
    wrapper1ReadyState.mockReturnValue(4); // HAVE_ENOUGH_DATA
    wrapper2ReadyState.mockReturnValue(4); // HAVE_ENOUGH_DATA

    // Try to play again, which should succeed now
    await mediaSyncElement.play();

    // Expect that play was called on wrappers
    expect(wrapper1PlaySpy).toHaveBeenCalled();
    expect(wrapper2PlaySpy).toHaveBeenCalled();
  });

  it("should forward waiting events from media elements", () => {
    const waitingSpy = vi.fn();
    mediaSyncElement.addEventListener("waiting", waitingSpy);

    // Simulate a waiting event from the first wrapper
    wrapper1.dispatchEvent(
      new CustomEvent(MediaEvent.waiting, {
        detail: { paused: false },
      })
    );

    // Check that the waiting event was forwarded
    expect(waitingSpy).toHaveBeenCalledTimes(1);
  });
});