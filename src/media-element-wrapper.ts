import { CustomEvents, MediaState } from "./constants";
import { MediaElementWrapper } from "./types";
import { Logger } from "./utils";

/**
 * Class that wraps and manages an individual HTML media element
 */
export class MediaElementWrapperImpl implements MediaElementWrapper {
  public id: string;
  public element: HTMLMediaElement;
  public state: MediaState = MediaState.LOADING;
  public isPlaying: boolean = false;
  public isMain: boolean = false;

  private onStateChangeCallback: (
    state: MediaState,
    wrapper: MediaElementWrapper
  ) => void;
  private onReadyCallback: (wrapper: MediaElementWrapper) => void;
  private isUserInitiated: boolean = true;

  constructor(
    element: HTMLMediaElement,
    options: {
      isMain?: boolean;
      onStateChange?: (state: MediaState, wrapper: MediaElementWrapper) => void;
      onReady?: (wrapper: MediaElementWrapper) => void;
    } = {}
  ) {
    this.id = Math.random().toString(36).substring(2, 15);
    this.element = element;
    this.isMain = options.isMain || false;

    this.onStateChangeCallback = options.onStateChange || (() => {});
    this.onReadyCallback = options.onReady || (() => {});

    this.setupEventDispatchers();
    this.setupEventListeners();

    
  }

  /**
   * Set up custom event dispatching for the media element
   */
  private setupEventDispatchers(): void {
    const originalGetter = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "currentTime"
    )?.get;
    const originalSetter = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "currentTime"
    )?.set;
    // Store reference to 'this' for closure
    const self = this;

    if (originalGetter && originalSetter) {

      Object.defineProperty(this.element, "currentTime", {
        get: function () {
          return originalGetter.call(this);
        },
        set: function (value) {
          self.isUserInitiated = false;
          originalSetter.call(this, value);
        },
      });
    } else {
      console.error("Failed to override currentTime property");
    }

    this.element.addEventListener("seeking", () => {
      if (this.isUserInitiated) {
        this.element.dispatchEvent(CustomEvents.user.seeking);
      } else {
        this.element.dispatchEvent(CustomEvents.programmatic.seeking);
      }
    });

    this.element.addEventListener("seeked", () => {
      if (this.isUserInitiated) {
        this.element.dispatchEvent(CustomEvents.user.seeked);
      } else {
        this.element.dispatchEvent(CustomEvents.programmatic.seeked);
      }
      this.isUserInitiated = true;
    });

    this.element.play = async function() {
      self.isUserInitiated = false
      try {
        await HTMLMediaElement.prototype.play.call(this);
        self.isUserInitiated = true
      } catch (error) {
        console.error('Error starting video playback:', error);
      }
    };

    this.element.addEventListener("play", () => {
      if (this.isUserInitiated) {
        this.element.dispatchEvent(CustomEvents.user.play);
      } else {
        this.element.dispatchEvent(CustomEvents.programmatic.play);
      }
    });
  }

  /**
   * Set up event listeners for the media element
   */
  private setupEventListeners(): void {
    // Playback state events
    this.element.addEventListener("play", () =>
      this.handleStateChange(MediaState.PLAYING)
    );
    this.element.addEventListener("pause", () =>
      this.handleStateChange(MediaState.PAUSED)
    );
    this.element.addEventListener("ended", () =>
      this.handleStateChange(MediaState.ENDED)
    );

    // Loading events
    this.element.addEventListener("loadeddata", () => this.handleReady());
    this.element.addEventListener("canplaythrough", () =>
      this.handleStateChange(MediaState.UNSTARTED)
    );
    this.element.addEventListener("waiting", () =>
      this.handleStateChange(MediaState.BUFFERING)
    );
  }

  /**
   * Handle media state changes
   */
  private handleStateChange(state: MediaState): void {
    this.state = state;

    if (state === MediaState.PLAYING) {
      this.isPlaying = true;
    }

    if (state === MediaState.PAUSED || state === MediaState.ENDED) {
      this.isPlaying = false;
    }

    Logger.debug(`${this.id} state changed to: ${state}`);
    this.onStateChangeCallback(state, this);
  }

  /**
   * Handle when the media is ready to play
   */
  private handleReady(): void {
    Logger.debug(`${this.id} is ready`);
    this.onReadyCallback(this);
  }

  /**
   * Play the media
   */
  public async play(): Promise<void> {
    console.log("play", this.id);
    if (this.isPlaying) return;

    try {
      await this.element.play();
    } catch (error) {
      Logger.error(`Error playing media ${this.id}:`, error);
    }
  }

  /**
   * Pause the media
   */
  public async pause(): Promise<void> {
    if (!this.isPlaying) return;

    try {
      this.element.pause();
    } catch (error) {
      Logger.error(`Error pausing media ${this.id}:`, error);
    }
  }

  /**
   * Seek to a specific time
   */
  public seekTo(time: number): void {
    if (!this.element) return;

    const duration = this.getDuration();

    // Ensure time is within valid range
    if (time >= duration) {
      // Set to just before the end to prevent triggering the ended event
      this.element.currentTime = Math.max(0, duration - 0.05);
      return;
    }

    Logger.debug(`Setting ${this.id} time to: ${time}`);
    this.element.currentTime = time;
  }

  /**
   * Get the current playback time
   */
  public getCurrentTime(): number {
    return this.element?.currentTime || 0;
  }

  /**
   * Get the total duration
   */
  public getDuration(): number {
    return this.element?.duration || 0;
  }

  /**
   * Check if the media has ended
   */
  public isEnded(): boolean {
    const diff = Math.abs(this.getCurrentTime() - this.getDuration());
    return diff < 0.1;
  }
}
