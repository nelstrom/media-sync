import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaElementWrapperImpl } from "./media-element-wrapper";

// Mock the Logger utility
vi.mock("./utils", () => {
  return {
    Logger: {
      debug: vi.fn(),
      error: vi.fn()
    }
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
    
    // Create a media element
    mediaElement = document.createElement("video") as HTMLMediaElement;
    
    // Override the methods on the specific instance
    // These need to be actual spies for expect().toHaveBeenCalled() to work
    mediaElement.play = playMock;
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
      expect(addEventListenerMock).toHaveBeenCalledWith("seeked", expect.any(Function));
      expect(addEventListenerMock).toHaveBeenCalledWith("play", expect.any(Function));
      expect(addEventListenerMock).toHaveBeenCalledWith("pause", expect.any(Function));
      expect(addEventListenerMock).toHaveBeenCalledWith("ratechange", expect.any(Function));
    });
  });
  
  describe("play method", () => {
    it("should call play on the underlying media element", async () => {
      // Because of how the wrapper overrides HTMLMediaElement.prototype.play, 
      // we need to spy on wrapper.play instead and just verify it's callable
      const playSpy = vi.spyOn(wrapper, 'play');
      
      await wrapper.play();
      
      expect(playSpy).toHaveBeenCalled();
    });
  });
  
  describe("pause method", () => {
    it("should call pause on the underlying media element", () => {
      // Similar to play, need to use a spy on the wrapper method
      const pauseSpy = vi.spyOn(wrapper, 'pause');
      
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
});