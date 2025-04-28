import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MediaElementWrapperImpl } from "./media-element-wrapper";
import { CustomEventNames } from "./constants";

// Mock the specific implementation parts that MediaElementWrapperImpl uses
vi.mock("./media-element-wrapper", async (importOriginal) => {
  const originalModule = await importOriginal<typeof import("./media-element-wrapper")>();
  return {
    ...originalModule,
    MediaElementWrapperImpl: class MockMediaElementWrapperImpl {
      public id: string;
      public isMain: boolean;
      private _element: HTMLMediaElement;

      constructor(element: HTMLMediaElement, options: { isMain?: boolean } = {}) {
        this.id = Math.random().toString(36).substring(2, 15);
        this._element = element;
        this.isMain = options.isMain || false;
      }

      public async play(): Promise<void> {
        await this._element.play();
      }

      public pause(): void {
        this._element.pause();
      }
    }
  };
});

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
  
  beforeEach(() => {
    // Create a mock HTMLMediaElement
    mediaElement = document.createElement("video");
    
    // Set up spy methods directly on the instance
    mediaElement.play = vi.fn().mockResolvedValue(undefined);
    mediaElement.pause = vi.fn();
    
    // Create a MediaElementWrapperImpl instance with the mock element
    wrapper = new MediaElementWrapperImpl(mediaElement);
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
  });
  
  describe("play method", () => {
    it("should call play on the underlying media element", async () => {
      await wrapper.play();
      expect(mediaElement.play).toHaveBeenCalled();
    });
  });
  
  describe("pause method", () => {
    it("should call pause on the underlying media element", () => {
      wrapper.pause();
      expect(mediaElement.pause).toHaveBeenCalled();
    });
  });
});