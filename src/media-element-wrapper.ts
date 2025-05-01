import { CustomEventNames } from "./constants";
import { Logger } from "./utils";

/**
 * Class that wraps and manages an individual HTML media element
 */
export class MediaElementWrapperImpl extends EventTarget {
  public id: string;
  private _element: HTMLMediaElement;
  public isMain: boolean = false;
  public audioSource?: MediaElementAudioSourceNode;

  private isUserInitiated: boolean = true;
  protected audioContext?: AudioContext;
  private gainNode?: GainNode;
  private emitEvents = {
    pause: true,
  };

  constructor(
    element: HTMLMediaElement,
    options: {
      isMain?: boolean;
    } = {}
  ) {
    super();
    this.id = Math.random().toString(36).substring(2, 15);
    this._element = element;
    this.isMain = options.isMain || false;

    this.setupEventDispatchers();
  }

  /**
   * Get the underlying HTML media element (for internal use only)
   * @internal
   */
  get element(): HTMLMediaElement {
    return this._element;
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
      Object.defineProperty(this._element, "currentTime", {
        get: function () {
          return originalGetter.call(this);
        },
        set: function (value) {
          self.isUserInitiated = false;
          originalSetter.call(this, value);
        },
      });
    } else {
      Logger.error("Failed to override currentTime property");
    }

    // Override playbackRate property to track if it was programmatically triggered
    const originalPlaybackRateGetter = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "playbackRate"
    )?.get;
    const originalPlaybackRateSetter = Object.getOwnPropertyDescriptor(
      HTMLMediaElement.prototype,
      "playbackRate"
    )?.set;

    if (originalPlaybackRateGetter && originalPlaybackRateSetter) {
      Object.defineProperty(this._element, "playbackRate", {
        get: function () {
          return originalPlaybackRateGetter.call(this);
        },
        set: function (value) {
          self.isUserInitiated = false;
          originalPlaybackRateSetter.call(this, value);
        },
      });
    } else {
      Logger.error("Failed to override playbackRate property");
    }

    this._element.addEventListener("seeking", (e) => {
      // Use this._element.currentTime as a fallback if e.target is not available (useful in tests)
      const currentTime =
        (e?.target as HTMLMediaElement)?.currentTime ??
        this._element.currentTime;
      if (this.isUserInitiated) {
        this.dispatchEvent(
          new CustomEvent(CustomEventNames.user.seeking, {
            detail: { currentTime },
          })
        );
      } else {
        this.dispatchEvent(
          new CustomEvent(CustomEventNames.programmatic.seeking, {
            detail: { currentTime },
          })
        );
      }
    });

    this._element.addEventListener("seeked", (e) => {
      // Use this._element.currentTime as a fallback if e.target is not available (useful in tests)
      const currentTime =
        (e?.target as HTMLMediaElement)?.currentTime ??
        this._element.currentTime;
      if (this.isUserInitiated) {
        this.dispatchEvent(
          new CustomEvent(CustomEventNames.user.seeked, {
            detail: { currentTime },
          })
        );
      } else {
        this.dispatchEvent(
          new CustomEvent(CustomEventNames.programmatic.seeked, {
            detail: { currentTime },
          })
        );
      }
      this.isUserInitiated = true;
    });

    this._element.addEventListener("ratechange", (e) => {
      // Use this._element.playbackRate as a fallback if e.target is not available (useful in tests)
      const playbackRate =
        (e?.target as HTMLMediaElement)?.playbackRate ??
        this._element.playbackRate;
      if (this.isUserInitiated) {
        this.dispatchEvent(
          new CustomEvent(CustomEventNames.user.ratechange, {
            detail: { playbackRate },
          })
        );
      } else {
        this.dispatchEvent(
          new CustomEvent(CustomEventNames.programmatic.ratechange, {
            detail: { playbackRate },
          })
        );
      }
      this.isUserInitiated = true;
    });

    this._element.play = async function () {
      self.isUserInitiated = false;
      try {
        await HTMLMediaElement.prototype.play.call(this);
        self.isUserInitiated = true;
      } catch (error) {
        Logger.error("Error starting video playback:", error);
      }
    };

    this._element.addEventListener("play", () => {
      if (this.isUserInitiated) {
        this.dispatchEvent(new CustomEvent(CustomEventNames.user.play));
      } else {
        this.dispatchEvent(new CustomEvent(CustomEventNames.programmatic.play));
      }
    });

    // Listen for pause events and dispatch appropriate custom events
    this._element.addEventListener("pause", () => {
      if (this.emitEvents.pause) {
        this.dispatchEvent(new CustomEvent(CustomEventNames.pause));
      } else {
        Logger.debug(`(Not emitting a pause event from ${this.id})`);
      }
    });
  }

  public suppressEventType(name: "pause") {
    Logger.debug(`suppressing ${name} events for ${this.id}`);
    this.emitEvents[name] = false;
  }

  public enableEventType(name: "pause") {
    Logger.debug(`enabling ${name} events for ${this.id}`);
    this.emitEvents[name] = true;
  }

  /**
   * Play the media
   */
  public async play(): Promise<void> {
    Logger.debug("play", this.id);
    
    try {
      await this._element.play();
    } catch (error) {
      Logger.error(`Error playing media ${this.id}:`, error);
    }
  }

  /**
   * Check if the media is currently playing
   */
  public isPlaying(): boolean {
    return !this._element.paused;
  }

  /**
   * Check if the media is currently paused
   */
  public isPaused(): boolean {
    return this._element.paused;
  }

  /**
   * Pause the media
   */
  public pause(): void {
    this._element.pause();
  }

  /**
   * Seek to a specific time
   */
  public set currentTime(time: number) {
    if (!this._element) return;

    // Ensure time is within valid range
    if (time >= this.duration) {
      // Set to just before the end to prevent triggering the ended event
      this._element.currentTime = Math.max(0, this.duration - 0.05);
      return;
    }

    Logger.debug(`Setting ${this.id} time to: ${time}`);
    this._element.currentTime = time;
  }

  /**
   * Get the current playback time
   */
  public get currentTime(): number {
    return this._element?.currentTime || 0;
  }

  /**
   * Get the total duration
   */
  public get duration(): number {
    return this._element?.duration || 0;
  }

  /**
   * Check if the media has ended
   */
  public isEnded(): boolean {
    const diff = Math.abs(this.currentTime - this.duration);
    return diff < 0.1;
  }

  /**
   * Connect this media element to a Web Audio API context
   * This allows for more precise synchronization
   */
  public connectToAudioContext(context: AudioContext): void {
    if (this.audioSource) {
      // Already connected
      return;
    }

    try {
      // Store reference to the audio context
      this.audioContext = context;

      // Create a source node from the media element
      this.audioSource = context.createMediaElementSource(this._element);

      // Create a gain node for potential volume control
      this.gainNode = context.createGain();

      // Connect the source to the gain node, then to the destination (speakers)
      this.audioSource.connect(this.gainNode);
      this.gainNode.connect(context.destination);

      Logger.debug(`Connected ${this.id} to Web Audio API context`);
    } catch (error) {
      Logger.error(`Error connecting ${this.id} to Web Audio API:`, error);
      this.disconnectFromAudioContext();
    }
  }

  /**
   * Disconnect from Web Audio API context
   */
  public disconnectFromAudioContext(): void {
    try {
      if (this.gainNode) {
        this.gainNode.disconnect();
        this.gainNode = undefined;
      }

      if (this.audioSource) {
        this.audioSource.disconnect();
        this.audioSource = undefined;
      }
      // console.log('ac', this.audioContext)
      this.audioContext = undefined;
      Logger.debug(`Disconnected ${this.id} from Web Audio API context`);
    } catch (error) {
      Logger.error(`Error disconnecting ${this.id} from Web Audio API:`, error);
    }
  }

  /**
   * Get the current playback rate
   */
  public get playbackRate(): number {
    return this._element?.playbackRate || 1.0;
  }

  /**
   * Set the playback rate
   */
  public set playbackRate(rate: number) {
    if (!this._element) return;

    Logger.debug(`Setting ${this.id} playbackRate to: ${rate}`);
    this._element.playbackRate = rate;
  }
}
