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
  public audioSource?: MediaElementAudioSourceNode;

  private isUserInitiated: boolean = true;
  protected audioContext?: AudioContext;
  private gainNode?: GainNode;

  constructor(
    element: HTMLMediaElement,
    options: {
      isMain?: boolean;
    } = {}
  ) {
    this.id = Math.random().toString(36).substring(2, 15);
    this.element = element;
    this.isMain = options.isMain || false;

    this.setupEventDispatchers();
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
      Logger.error("Failed to override currentTime property");
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

    this.element.play = async function () {
      self.isUserInitiated = false;
      try {
        await HTMLMediaElement.prototype.play.call(this);
        self.isUserInitiated = true;
      } catch (error) {
        Logger.error("Error starting video playback:", error);
      }
    };

    this.element.addEventListener("play", () => {
      if (this.isUserInitiated) {
        this.element.dispatchEvent(CustomEvents.user.play);
      } else {
        this.element.dispatchEvent(CustomEvents.programmatic.play);
      }
    });

    // Override the pause method to track if pause was programmatically triggered
    const originalPause = this.element.pause;
    this.element.pause = function() {
      self.isUserInitiated = false;
      originalPause.call(this);
    };

    // Listen for pause events and dispatch appropriate custom events
    this.element.addEventListener("pause", () => {
      if (this.isUserInitiated) {
        this.element.dispatchEvent(CustomEvents.user.pause);
      } else {
        this.element.dispatchEvent(CustomEvents.programmatic.pause);
      }
      this.isUserInitiated = true;
    });
  }

  /**
   * Play the media
   */
  public async play(): Promise<void> {
    Logger.debug("play", this.id);
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
  public pause(): void {
    this.element.pause();
  }

  /**
   * Seek to a specific time
   */
  public set currentTime(time: number) {
    if (!this.element) return;

    // Ensure time is within valid range
    if (time >= this.duration) {
      // Set to just before the end to prevent triggering the ended event
      this.element.currentTime = Math.max(0, this.duration - 0.05);
      return;
    }

    Logger.debug(`Setting ${this.id} time to: ${time}`);
    this.element.currentTime = time;
  }

  /**
   * Get the current playback time
   */
  public get currentTime(): number {
    return this.element?.currentTime || 0;
  }

  /**
   * Get the total duration
   */
  public get duration(): number {
    return this.element?.duration || 0;
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
      this.audioSource = context.createMediaElementSource(this.element);
      
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
}
