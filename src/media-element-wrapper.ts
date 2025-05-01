import { CustomEventNames, SEEK_DEBOUNCE_DELAY } from "./constants";
import { Logger, debounce } from "./utils";
import { SuppressibleEventName } from "./types";

/**
 * Class that wraps and manages an individual HTML media element
 */
export class MediaElementWrapperImpl extends EventTarget {
  public id: string;
  private _element: HTMLMediaElement;
  public isMain: boolean = false;
  public audioSource?: MediaElementAudioSourceNode;

  protected audioContext?: AudioContext;
  private gainNode?: GainNode;
  private emitEvents: Record<string, boolean> = {
    [CustomEventNames.pause]: true,
    [CustomEventNames.play]: true,
    [CustomEventNames.ratechange]: true,
    [CustomEventNames.seeking]: true,
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
    // Debounce seeking events to prevent rapid-fire events
    const debouncedSeekingHandler = debounce((currentTime: number) => {
      if (this.emitEvents[CustomEventNames.seeking]) {
        this.dispatchEvent(
          new CustomEvent(CustomEventNames.seeking, {
            detail: { currentTime },
          })
        );
      } else {
        Logger.debug(`(Not emitting a seeking event from ${this.id})`);
      }
    }, SEEK_DEBOUNCE_DELAY);

    this._element.addEventListener("seeking", (e) => {
      // Use this._element.currentTime as a fallback if e.target is not available (useful in tests)
      const currentTime =
        (e?.target as HTMLMediaElement)?.currentTime ??
        this._element.currentTime;
      
      // Use the debounced handler to prevent rapid-fire seeking events
      debouncedSeekingHandler(currentTime);
    });

    this._element.addEventListener("ratechange", (e) => {
      // Use this._element.playbackRate as a fallback if e.target is not available (useful in tests)
      const playbackRate =
        (e?.target as HTMLMediaElement)?.playbackRate ??
        this._element.playbackRate;
      
      if (this.emitEvents[CustomEventNames.ratechange]) {
        this.dispatchEvent(
          new CustomEvent(CustomEventNames.ratechange, {
            detail: { playbackRate },
          })
        );
      } else {
        Logger.debug(`(Not emitting a ratechange event from ${this.id})`);
      }
    });

    this._element.addEventListener("play", () => {
      if (this.emitEvents[CustomEventNames.play]) {
        this.dispatchEvent(new CustomEvent(CustomEventNames.play));
      } else {
        Logger.debug(`(Not emitting a play event from ${this.id})`);
      }
    });

    // Listen for pause events and dispatch appropriate custom events
    this._element.addEventListener("pause", () => {
      if (this.emitEvents[CustomEventNames.pause]) {
        this.dispatchEvent(new CustomEvent(CustomEventNames.pause));
      } else {
        Logger.debug(`(Not emitting a pause event from ${this.id})`);
      }
    });
  }

  public suppressEventType(name: SuppressibleEventName) {
    Logger.debug(`suppressing ${name} events for ${this.id}`);
    this.emitEvents[name] = false;
  }

  public enableEventType(name: SuppressibleEventName) {
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
