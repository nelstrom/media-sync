import { CustomEventNames } from "./constants";
import { MediaElementWrapperImpl } from "./media-element-wrapper";
import { MediaElementWrapper } from "./types";
import { Logger, debounce } from "./utils";

/**
 * MediaSync class that manages and synchronizes multiple media elements
 */
export class MediaSync extends HTMLElement {
  private mediaElements: MediaElementWrapper[] = [];
  private isSyncingPlay: boolean = false;
  private isSyncingPause: boolean = false;
  private isSyncingSeeking: boolean = false;
  
  // Store the last seek time
  private lastSeekTime: number | null = null;
  
  // Debounce delay for seeking events (in milliseconds)
  private readonly SEEK_DEBOUNCE_DELAY = 50;

  constructor() {
    super();
    Logger.debug("MediaSync: Initializing");
  }

  /**
   * Called when the element is connected to the DOM
   */
  connectedCallback(): void {
    Logger.debug("MediaSync: Connected to DOM");
    this.initialize();
  }

  /**
   * Called when the element is disconnected from the DOM
   */
  disconnectedCallback(): void {
    Logger.debug("MediaSync: Disconnected from DOM");
    // Clean up any resources if needed
  }

  /**
   * Initialize the media sync element
   */
  public initialize(): void {
    // Find all media elements (audio and video) that are children of this element
    const mediaElements = [
      ...this.querySelectorAll("audio, video"),
    ] as HTMLMediaElement[];

    if (mediaElements.length === 0) {
      Logger.error("No media elements found in MediaSync container");
      return;
    }

    // The first element is designated as the main one (controlling sync)
    this.setupMediaElements(mediaElements, mediaElements[0]);
  }

  /**
   * Set up media elements for synchronization
   */
  private setupMediaElements(
    elements: HTMLMediaElement[],
    mainElement: HTMLMediaElement
  ): void {
    elements.forEach((element, index) => {
      const isMain = element === mainElement;

      const wrapper = new MediaElementWrapperImpl(element, {
        isMain,
      });

      // Handle user-initiated seeking events with debouncing
      const handleUserSeeking = debounce(() => {
        Logger.debug(`User seeking event from element ${index}`);
        
        // Store the time for reference
        this.lastSeekTime = element.currentTime;
        
        // Schedule the actual sync with a small delay to capture the final position
        setTimeout(() => {
          if (this.lastSeekTime !== null) {
            this.syncSeekTracks(element, this.lastSeekTime);
          }
        }, this.SEEK_DEBOUNCE_DELAY);
      }, this.SEEK_DEBOUNCE_DELAY);
      
      // Handle programmatic seeking events
      element.addEventListener(CustomEventNames.programmatic.seeking, () => {
        Logger.debug(`Programmatic seeking event from element ${index}`);
        
        // No need to sync if we're already in a sync operation
        if (this.isSyncingSeeking) return;
        
        this.syncSeekTracks(element, element.currentTime);
      });
      
      // Handle user-initiated seeking
      element.addEventListener(CustomEventNames.user.seeking, () => {
        handleUserSeeking();
      });

      // Log seeked events
      element.addEventListener(CustomEventNames.programmatic.seeked, () => {
        Logger.debug(`Programmatic seeked event from element ${index}`);
      });
      
      element.addEventListener(CustomEventNames.user.seeked, () => {
        Logger.debug(`User seeked event from element ${index}`);
      });

      // Handle user-initiated play events
      element.addEventListener(CustomEventNames.user.play, () => {
        Logger.debug(`User play event from element ${index}`);
        this.playTracks(this.otherTracks(element));
      });

      // Handle programmatic play events
      element.addEventListener(CustomEventNames.programmatic.play, () => {
        Logger.debug(`Programmatic play event from element ${index}`);
        this.playTracks(this.otherTracks(element));
      });

      // Handle user-initiated pause events
      element.addEventListener(CustomEventNames.user.pause, () => {
        Logger.debug(`User pause event from element ${index}`);
        this.pauseTracks(this.otherTracks(element));
      });

      // Handle programmatic pause events
      element.addEventListener(CustomEventNames.programmatic.pause, () => {
        Logger.debug(`Programmatic pause event from element ${index}`);
        this.pauseTracks(this.otherTracks(element));
      });

      this.mediaElements.push(wrapper);

      if (isMain) {
        Logger.debug(`Set element ${index} as main media element`);
      }
    });
  }

  /**
   * Synchronize seeking across all media elements
   * @param sourceElement The element that initiated the seek
   * @param targetTime The time to seek to
   */
  private syncSeekTracks(sourceElement: HTMLMediaElement, targetTime: number): void {
    const targetTracks = this.otherTracks(sourceElement);
    
    if (targetTracks.length === 0) {
      return;
    }
    
    if (this.isSyncingSeeking) {
      Logger.debug("syncSeekTracks called while syncing. Skipping...");
      return;
    }
    
    Logger.debug(`MediaSync: Syncing seek to ${targetTime}s for ${targetTracks.length} media elements`);
    
    // Set flag to prevent infinite loops from programmatic seeking events
    this.isSyncingSeeking = true;
    
    // Sync the time on all other media elements
    targetTracks.forEach(media => {
      media.seekTo(targetTime);
    });
    
    // Reset flag after a short delay to prevent race conditions
    setTimeout(() => {
      this.isSyncingSeeking = false;
    }, this.SEEK_DEBOUNCE_DELAY * 2);
  }

  /**
   * Play all media elements
   */
  public async play(): Promise<void> {
    await this.playTracks();
  }

  private otherTracks(exludeElement: HTMLMediaElement) {
    return this.mediaElements.filter((me) => me.element !== exludeElement);
  }

  private async playTracks(mediaElements = this.mediaElements): Promise<void> {
    if (mediaElements.length === 0) {
      Logger.error("No media elements available to play");
      return;
    }

    if (this.isSyncingPlay) {
      Logger.debug("playTracks called while syncing. Skipping...");
      return;
    }

    try {
      Logger.debug(`MediaSync: Playing ${mediaElements.length} media elements`);

      // Set flag to prevent infinite loops from programmatic play events
      this.isSyncingPlay = true;

      // Play all media elements
      const playPromises = mediaElements.map((media) => media.play());

      // Wait for all play operations to complete
      await Promise.all(playPromises);

      // Reset flag after all play operations are complete
      setTimeout(() => {
        this.isSyncingPlay = false;
      }, 0);
    } catch (error) {
      Logger.error("Error playing media elements:", error);
    }
  }

  /**
   * Pause all media elements
   */
  public pause(): void {
    this.pauseTracks();
  }

  private pauseTracks(mediaElements = this.mediaElements): void {
    if (mediaElements.length === 0) {
      Logger.error("No media elements available to pause");
      return;
    }

    if (this.isSyncingPause) {
      Logger.debug("pauseTracks called while syncing. Skipping...");
      return;
    }

    Logger.debug("MediaSync: Pausing all media elements");

    // Set flag to prevent infinite loops from programmatic pause events
    this.isSyncingPause = true;

    // Pause all media elements - this is synchronous
    mediaElements.forEach((media) => media.pause());

    // Reset flag after pausing is complete
    // Use setTimeout to ensure this runs after the current execution cycle
    setTimeout(() => {
      this.isSyncingPause = false;
    }, 0);
  }
  
  /**
   * Seek all media elements to a specific time
   * @param time The time to seek to in seconds
   */
  public seekAll(time: number): void {
    if (this.mediaElements.length === 0) {
      Logger.error("No media elements available to seek");
      return;
    }
    
    Logger.debug(`MediaSync: Seeking all media elements to ${time}s`);
    
    // Set flag to prevent infinite loops
    this.isSyncingSeeking = true;
    
    // Seek all media elements
    this.mediaElements.forEach(media => {
      media.seekTo(time);
    });
    
    // Reset flag after seeking is complete
    setTimeout(() => {
      this.isSyncingSeeking = false;
    }, this.SEEK_DEBOUNCE_DELAY * 2);
  }
}
