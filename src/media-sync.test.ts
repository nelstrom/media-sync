import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MediaSync } from "./media-sync";
import { CustomEventNames } from "./constants";

// Register the custom element if not already registered
if (!customElements.get("media-sync")) {
  customElements.define("media-sync", MediaSync);
}

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

describe("MediaSync", () => {
  let mediaSyncElement: MediaSync;
  
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
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should sync play to other elements when one element triggers play", () => {
    // Create two video elements
    const video1 = document.createElement("video");
    const video2 = document.createElement("video");
    
    // Initialize the media-sync element with the videos
    const [wrapper1, wrapper2] = mediaSyncElement.initialize([video1, video2]);
    
    const wrapper1PlaySpy = vi.spyOn(wrapper1, 'play');
    const wrapper2PlaySpy = vi.spyOn(wrapper2, 'play');
    
    // Reset all mocks before the actual test
    vi.clearAllMocks();
    
    // Simulate a user play event from wrapper1
    wrapper1.dispatchEvent(new CustomEvent(CustomEventNames.user.play));
    
    expect(wrapper1PlaySpy).not.toHaveBeenCalled();
    expect(wrapper2PlaySpy).toHaveBeenCalled();
  });
});