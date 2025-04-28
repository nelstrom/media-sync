import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaSync } from "./media-sync";
import { MediaElementWrapperImpl } from "./media-element-wrapper";

// Register the custom element if not already registered
if (!customElements.get("media-sync")) {
  customElements.define("media-sync", MediaSync);
}

// Mock the MediaElementWrapper class
vi.mock("./media-element-wrapper", () => {
  return {
    MediaElementWrapperImpl: vi.fn().mockImplementation((_element, options = {}) => {
      return {
        id: 'mock-wrapper-id',
        isMain: options.isMain || false,
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        get currentTime() { return 0; },
        set currentTime(_: number) {},
        get duration() { return 100; },
        get playbackRate() { return 1.0; },
        set playbackRate(_: number) {},
        isEnded: vi.fn().mockReturnValue(false),
        isPlaying: vi.fn().mockReturnValue(true),
        isPaused: vi.fn().mockReturnValue(false),
        connectToAudioContext: vi.fn(),
        disconnectFromAudioContext: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn()
      };
    })
  };
});

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

// Mock HTMLMediaElement prototype methods
beforeEach(() => {
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
});

describe("MediaSync", () => {
  let mediaSyncElement: MediaSync;
  let mockMediaElements: HTMLMediaElement[];
  
  beforeEach(() => {
    // Create MediaSync element
    mediaSyncElement = document.createElement("media-sync") as MediaSync;
    
    // Create mock media elements
    mockMediaElements = [
      document.createElement("video"),
      document.createElement("video")
    ];
    
    // Reset MediaElementWrapperImpl mock
    vi.mocked(MediaElementWrapperImpl).mockClear();
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe("initialization", () => {
    it("should create wrapper for each media element", () => {
      // Initialize with mock media elements
      mediaSyncElement.initialize(mockMediaElements);
      
      // Verify that MediaElementWrapperImpl was called twice (once for each element)
      expect(MediaElementWrapperImpl).toHaveBeenCalledTimes(2);
      
      // Check if first call had isMain: true
      const firstCallOptions = (MediaElementWrapperImpl as any).mock.calls[0][1];
      expect(firstCallOptions.isMain).toBe(true);
      
      // Check if second call had no isMain or isMain: false
      const secondCallOptions = (MediaElementWrapperImpl as any).mock.calls[1][1];
      expect(secondCallOptions.isMain).toBe(false);
    });
    
    it("should not create wrappers if no media elements provided", () => {
      // Initialize with empty array
      mediaSyncElement.initialize([]);
      
      // Verify that MediaElementWrapperImpl was not called
      expect(MediaElementWrapperImpl).not.toHaveBeenCalled();
    });
  });
});