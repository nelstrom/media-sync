import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaElementWrapperImpl } from "./media-element-wrapper";
import { MediaEvent } from "./constants";

// Mock the Logger utility - must be before imports due to hoisting
vi.mock("./utils", async () => {
  return {
    Logger: {
      debug: vi.fn(),
      error: vi.fn()
    },
    // Mock debounce to immediately call the function
    debounce: vi.fn().mockImplementation((fn) => fn)
  };
});

describe("MediaElementWrapper", () => {
  let wrapper: MediaElementWrapperImpl;
  let mediaElement: HTMLMediaElement;
  let playMock: ReturnType<typeof vi.fn>;
  let pauseMock: ReturnType<typeof vi.fn>;
  let addEventListenerMock: ReturnType<typeof vi.fn>;
  
  beforeEach(() => {
    // Create mocks
    playMock = vi.fn().mockResolvedValue(undefined);
    pauseMock = vi.fn();
    addEventListenerMock = vi.fn();
    
    // Mock HTMLMediaElement.prototype.play globally to avoid JSDOM warning
    Object.defineProperty(HTMLMediaElement.prototype, 'play', {
      configurable: true,
      writable: true,
      value: vi.fn().mockResolvedValue(undefined)
    });
    
    // Create a media element
    mediaElement = document.createElement("video") as HTMLMediaElement;
    
    // Override the methods on the specific instance
    // These need to be actual spies for expect().toHaveBeenCalled() to work
    mediaElement.play = playMock as unknown as () => Promise<void>;
    mediaElement.pause = pauseMock;
    mediaElement.addEventListener = addEventListenerMock;
    
    // Set properties on the media element
    Object.defineProperties(mediaElement, {
      currentTime: {
        configurable: true,
        value: 0,
        writable: true
      },
      duration: {
        configurable: true,
        value: 100,
        writable: false
      },
      paused: {
        configurable: true,
        value: false,
        writable: true
      },
      playbackRate: {
        configurable: true,
        value: 1.0,
        writable: true
      }
    });
    
    // Create the wrapper with our mocked media element
    wrapper = new MediaElementWrapperImpl(mediaElement, {});
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe("initialization", () => {
    it("should initialize with a unique ID", () => {
      expect(wrapper.id).toBeDefined();
      expect(typeof wrapper.id).toBe("string");
    });
    
    it("should set isMain based on constructor options", () => {
      const mainWrapper = new MediaElementWrapperImpl(mediaElement, { isMain: true });
      expect(mainWrapper.isMain).toBe(true);
      
      const nonMainWrapper = new MediaElementWrapperImpl(mediaElement, { isMain: false });
      expect(nonMainWrapper.isMain).toBe(false);
      
      // Default should be false
      const defaultWrapper = new MediaElementWrapperImpl(mediaElement);
      expect(defaultWrapper.isMain).toBe(false);
    });
    
    it("should set up event listeners on the media element", () => {
      // Verify addEventListener was called for the relevant events
      expect(addEventListenerMock).toHaveBeenCalledWith("seeking", expect.any(Function));
      expect(addEventListenerMock).toHaveBeenCalledWith("play", expect.any(Function));
      expect(addEventListenerMock).toHaveBeenCalledWith("pause", expect.any(Function));
      expect(addEventListenerMock).toHaveBeenCalledWith("ratechange", expect.any(Function));
    });
  });
  
  describe("play method", () => {
    it("should call play on the underlying media element", async () => {
      const playSpy = vi.spyOn(mediaElement, 'play');
      
      await wrapper.play();
      
      expect(playSpy).toHaveBeenCalled();
    });
  });
  
  describe("pause method", () => {
    it("should call pause on the underlying media element", () => {
      const pauseSpy = vi.spyOn(mediaElement, 'pause');
      
      wrapper.pause();
      
      expect(pauseSpy).toHaveBeenCalled();
    });
  });
  
  describe("currentTime property", () => {
    it("should get currentTime from the media element", () => {
      // Set a value on the mock media element
      mediaElement.currentTime = 42;
      // Check that the wrapper returns this value
      expect(wrapper.currentTime).toBe(42);
    });
    
    it("should set currentTime on the media element", () => {
      // Set via the wrapper
      wrapper.currentTime = 42;
      // Check the value was set on the media element
      expect(mediaElement.currentTime).toBe(42);
    });
  });
  
  describe("playbackRate property", () => {
    it("should get playbackRate from the media element", () => {
      // Set a value on the mock media element
      mediaElement.playbackRate = 1.5;
      // Check that the wrapper returns this value
      expect(wrapper.playbackRate).toBe(1.5);
    });
    
    it("should set playbackRate on the media element", () => {
      // Set via the wrapper
      wrapper.playbackRate = 1.5;
      // Check the value was set on the media element
      expect(mediaElement.playbackRate).toBe(1.5);
    });
  });
  
  describe("element getter", () => {
    it("should return the underlying HTMLMediaElement", () => {
      expect(wrapper.element).toBe(mediaElement);
    });
  });
  
  describe("isPlaying and isPaused methods", () => {
    it("should return correct playing state based on media element", () => {
      // Default in our test setup is paused=false (playing)
      expect(wrapper.isPlaying()).toBe(true);
      expect(wrapper.isPaused()).toBe(false);
      
      // Now set to paused
      Object.defineProperty(mediaElement, 'paused', {
        configurable: true,
        value: true,
        writable: true
      });
      
      expect(wrapper.isPlaying()).toBe(false);
      expect(wrapper.isPaused()).toBe(true);
    });
  });
  
  describe("isEnded method", () => {
    it("should return true when currentTime is close to duration", () => {
      // Set currentTime to almost at the end
      mediaElement.currentTime = 99.95;
      expect(wrapper.isEnded()).toBe(true);
      
      // Set to exactly at the end
      mediaElement.currentTime = 100;
      expect(wrapper.isEnded()).toBe(true);
      
      // Set to well before the end
      mediaElement.currentTime = 50;
      expect(wrapper.isEnded()).toBe(false);
    });
  });
  
  describe("currentTime setter with edge cases", () => {
    it("should handle setting currentTime past duration", () => {
      wrapper.currentTime = 150;
      // Should set to just before the end to prevent "ended" event
      expect(mediaElement.currentTime).toBe(99.95);
    });
    
    it("should set currentTime normally when within duration", () => {
      wrapper.currentTime = 75;
      expect(mediaElement.currentTime).toBe(75);
    });
  });
  
  describe("custom event dispatching", () => {
    let dispatchEventSpy: any;
    
    beforeEach(() => {
      dispatchEventSpy = vi.spyOn(wrapper, 'dispatchEvent');
    });
    
    it("should debounce and dispatch seeking event when emitEvents.seeking is true", () => {
      // Get the seeking listener and call it
      const seekingCall = addEventListenerMock.mock.calls.find(
        call => call[0] === "seeking"
      );
      expect(seekingCall).toBeDefined();
      const seekingHandler = seekingCall![1];
      
      // Set emitEvents.seeking to true
      (wrapper as any).emitEvents[MediaEvent.seeking] = true;
      
      // Call handler with mock event
      seekingHandler({
        target: {
          currentTime: 42
        }
      });
      
      // Since we're mocking debounce to call the function immediately,
      // we can check that the event was dispatched
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MediaEvent.seeking,
          detail: expect.objectContaining({
            currentTime: 42
          })
        })
      );
    });
    
    it("should not dispatch seeking event when emitEvents.seeking is false", () => {
      // Get the seeking listener and call it
      const seekingCall = addEventListenerMock.mock.calls.find(
        call => call[0] === "seeking"
      );
      expect(seekingCall).toBeDefined();
      const seekingHandler = seekingCall![1];
      
      // Set emitEvents.seeking to false
      (wrapper as any).emitEvents[MediaEvent.seeking] = false;
      
      // Reset the mock to clear previous calls
      dispatchEventSpy.mockClear();
      
      // Call handler with mock event
      seekingHandler({
        target: {
          currentTime: 42
        }
      });
      
      // Check that no event was dispatched
      expect(dispatchEventSpy).not.toHaveBeenCalled();
    });
    
    it("should dispatch play event when emitEvents.play is true", () => {
      // Get the play listener and call it
      const playCall = addEventListenerMock.mock.calls.find(
        call => call[0] === "play"
      );
      expect(playCall).toBeDefined();
      const playHandler = playCall![1];
      
      // Make sure emitEvents.play is true
      (wrapper as any).emitEvents[MediaEvent.play] = true;
      
      // Call the handler
      playHandler();
      
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MediaEvent.play
        })
      );
    });
    
    it("should not dispatch play event when emitEvents.play is false", () => {
      // Get the play listener and call it
      const playCall = addEventListenerMock.mock.calls.find(
        call => call[0] === "play"
      );
      expect(playCall).toBeDefined();
      const playHandler = playCall![1];
      
      // Set emitEvents.play to false
      (wrapper as any).emitEvents[MediaEvent.play] = false;
      
      // Call handler
      playHandler();
      
      // Should not dispatch event
      expect(dispatchEventSpy).not.toHaveBeenCalled();
    });
    
    it("should dispatch pause event when emitEvents.pause is true", () => {
      // Get the pause listener and call it
      const pauseCall = addEventListenerMock.mock.calls.find(
        call => call[0] === "pause"
      );
      expect(pauseCall).toBeDefined();
      const pauseHandler = pauseCall![1];
      
      // Make sure emitEvents.pause is true
      (wrapper as any).emitEvents[MediaEvent.pause] = true;
      
      // Call the handler
      pauseHandler();
      
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MediaEvent.pause
        })
      );
    });
    
    it("should not dispatch pause event when emitEvents.pause is false", () => {
      // Get the pause listener and call it
      const pauseCall = addEventListenerMock.mock.calls.find(
        call => call[0] === "pause"
      );
      expect(pauseCall).toBeDefined();
      const pauseHandler = pauseCall![1];
      
      // Set emitEvents.pause to false
      (wrapper as any).emitEvents[MediaEvent.pause] = false;
      
      // Call handler
      pauseHandler();
      
      // Should not dispatch event
      expect(dispatchEventSpy).not.toHaveBeenCalled();
    });
    
    it("should dispatch ratechange event when emitEvents.ratechange is true", () => {
      // Create a mock event with a target having playbackRate
      const mockEvent = {
        target: {
          playbackRate: 1.5
        }
      };
      
      // Get the ratechange listener and call it
      const ratechangeCall = addEventListenerMock.mock.calls.find(
        call => call[0] === "ratechange"
      );
      expect(ratechangeCall).toBeDefined();
      const ratechangeHandler = ratechangeCall![1];
      
      // Make sure emitEvents.ratechange is true
      (wrapper as any).emitEvents[MediaEvent.ratechange] = true;
      
      // Call handler
      ratechangeHandler(mockEvent);
      
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MediaEvent.ratechange,
          detail: { playbackRate: 1.5 }
        })
      );
    });
    
    it("should not dispatch ratechange event when emitEvents.ratechange is false", () => {
      // Create a mock event with a target having playbackRate
      const mockEvent = {
        target: {
          playbackRate: 2.0
        }
      };
      
      // Get the ratechange listener and call it
      const ratechangeCall = addEventListenerMock.mock.calls.find(
        call => call[0] === "ratechange"
      );
      expect(ratechangeCall).toBeDefined();
      const ratechangeHandler = ratechangeCall![1];
      
      // Set emitEvents.ratechange to false
      (wrapper as any).emitEvents[MediaEvent.ratechange] = false;
      
      // Call handler
      ratechangeHandler(mockEvent);
      
      // Should not dispatch event
      expect(dispatchEventSpy).not.toHaveBeenCalled();
    });
  });
  
  describe("Web Audio API methods", () => {
    let audioContext: AudioContext;
    let createMediaElementSourceMock: ReturnType<typeof vi.fn>;
    let createGainMock: ReturnType<typeof vi.fn>;
    let connectMock: ReturnType<typeof vi.fn>;
    let disconnectMock: ReturnType<typeof vi.fn>;
    
    beforeEach(() => {
      // Mock an AudioContext and its methods
      createMediaElementSourceMock = vi.fn().mockReturnValue({
        connect: connectMock = vi.fn(),
        disconnect: disconnectMock = vi.fn()
      });
      
      createGainMock = vi.fn().mockReturnValue({
        connect: connectMock,
        disconnect: disconnectMock
      });
      
      audioContext = {
        createMediaElementSource: createMediaElementSourceMock,
        createGain: createGainMock,
        destination: {}
      } as unknown as AudioContext;
    });
    
    it("should connect to the audio context", () => {
      wrapper.connectToAudioContext(audioContext);
      
      expect(createMediaElementSourceMock).toHaveBeenCalledWith(mediaElement);
      expect(createGainMock).toHaveBeenCalled();
      expect(connectMock).toHaveBeenCalledTimes(2);
      expect(wrapper.audioSource).toBeDefined();
    });
    
    it("should not reconnect if already connected", () => {
      // Connect once
      wrapper.connectToAudioContext(audioContext);
      
      // Reset mocks
      createMediaElementSourceMock.mockClear();
      createGainMock.mockClear();
      connectMock.mockClear();
      
      // Try to connect again
      wrapper.connectToAudioContext(audioContext);
      
      // Verify no new connections were made
      expect(createMediaElementSourceMock).not.toHaveBeenCalled();
      expect(createGainMock).not.toHaveBeenCalled();
      expect(connectMock).not.toHaveBeenCalled();
    });
    
    it("should handle errors during connection", () => {
      // Make createMediaElementSource throw an error
      createMediaElementSourceMock.mockImplementation(() => {
        throw new Error("Connection error");
      });
      
      // Mock disconnectFromAudioContext
      const disconnectSpy = vi.spyOn(wrapper, 'disconnectFromAudioContext');
      
      // This should throw internally but not externally
      wrapper.connectToAudioContext(audioContext);
      
      // Should call disconnect on error
      expect(disconnectSpy).toHaveBeenCalled();
      
      // We should not have an audioSource after an error
      expect(wrapper.audioSource).toBeUndefined();
    });
    
    it("should disconnect from audio context", () => {
      // First connect
      wrapper.connectToAudioContext(audioContext);
      
      // Then disconnect
      wrapper.disconnectFromAudioContext();
      
      expect(disconnectMock).toHaveBeenCalledTimes(2);
      expect(wrapper.audioSource).toBeUndefined();
    });
  });
});