import { CustomEventNames } from "./constants";
import { MediaElementWrapperImpl } from "./media-element-wrapper";
import { MediaElementWrapper } from "./types";
import { Logger, debounce } from "./utils";

// Debounce delay for seeking events (in milliseconds)
const SEEK_DEBOUNCE_DELAY = 10;

// Sample every 100ms (10 samples per second)
const DRIFT_SAMPLE_INTERVAL = 100;

// Interface for drift samples
interface DriftSample {
  timestamp: number;      // Main track's currentTime
  drifts: number[];       // Drift for each track in milliseconds (relative to main)
}

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
  
  // Drift sampling properties
  public driftSamples: DriftSample[] = [];
  private driftSamplingIntervalId: number | null = null;

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
    // Stop drift sampling when disconnected
    this.stopDriftSampling();
  }
  
  /**
   * Start sampling drift between media elements
   */
  private startDriftSampling(): void {
    if (this.driftSamplingIntervalId !== null) {
      // Already sampling
      return;
    }
    
    Logger.debug('Starting drift sampling');
    // this.driftSamples = []; // Reset samples
    
    this.driftSamplingIntervalId = window.setInterval(() => {
      this.sampleDrift();
    }, DRIFT_SAMPLE_INTERVAL);
  }
  
  /**
   * Stop sampling drift between media elements
   */
  private stopDriftSampling(): void {
    if (this.driftSamplingIntervalId !== null) {
      Logger.debug(`Stopping drift sampling. Collected ${this.driftSamples.length} samples`);
      window.clearInterval(this.driftSamplingIntervalId);
      this.driftSamplingIntervalId = null;
    }
  }
  
  /**
   * Take a single drift sample
   */
  private sampleDrift(): void {
    if (this.mediaElements.length <= 1) {
      return; // Need at least 2 media elements to measure drift
    }
    
    // Find the main element
    const mainElement = this.mediaElements.find(media => media.isMain) || this.mediaElements[0];
    const mainTime = mainElement.element.currentTime;
    
    // Skip if main element is not playing
    if (mainElement.element.paused) {
      return;
    }
    
    // Calculate drift for each track relative to the main track
    const drifts = this.mediaElements.map(media => {
      if (media === mainElement) {
        return 0; // No drift for the main track
      }
      
      // Calculate drift in milliseconds
      const drift = (media.element.currentTime - mainTime) * 1000;
      return drift;
    });
    
    // Record the sample
    this.driftSamples.push({
      timestamp: mainTime,
      drifts: drifts
    });
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
            // Get all tracks except the source and seek them
            const targetTracks = this.otherTracks(element);
            this.seekTracks(targetTracks, this.lastSeekTime);
          }
        }, SEEK_DEBOUNCE_DELAY);
      }, SEEK_DEBOUNCE_DELAY);
      
      // Handle programmatic seeking events
      element.addEventListener(CustomEventNames.programmatic.seeking, () => {
        Logger.debug(`Programmatic seeking event from element ${index}`);
        // Get all tracks except the source and seek them
        const targetTracks = this.otherTracks(element);
        this.seekTracks(targetTracks, element.currentTime);
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
   * Seek a set of media elements to a specific time
   * @param mediaElements The media elements to seek (defaults to all elements)
   * @param time The time to seek to
   */
  private seekTracks(mediaElements = this.mediaElements, time: number): void {
    if (mediaElements.length === 0) {
      Logger.error("No media elements available to seek");
      return;
    }
    
    if (this.isSyncingSeeking) {
      Logger.debug("seekTracks called while syncing. Skipping...");
      return;
    }
    
    Logger.debug(`MediaSync: Seeking ${mediaElements.length} media elements to ${time}s`);
    
    // Stop drift sampling during seeking to avoid misleading data
    this.stopDriftSampling();
    
    // Set flag to prevent infinite loops from programmatic seeking events
    this.isSyncingSeeking = true;
    
    // Seek all specified media elements
    mediaElements.forEach(media => {
      media.seekTo(time);
    });
    
    // Reset flag after a short delay to prevent race conditions
    setTimeout(() => {
      this.isSyncingSeeking = false;
      
      // If all elements are playing after seeking, restart drift sampling
      const allPlaying = this.mediaElements.every(media => !media.element.paused);
      if (allPlaying) {
        this.startDriftSampling();
      }
    }, SEEK_DEBOUNCE_DELAY * 2);
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
      
      // Start drift sampling if all tracks are playing
      const allPlaying = this.mediaElements.every(media => !media.element.paused);
      if (allPlaying) {
        this.startDriftSampling();
      }

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
    
    // Stop drift sampling when pausing
    this.stopDriftSampling();

    // Reset flag after pausing is complete
    // Use setTimeout to ensure this runs after the current execution cycle
    setTimeout(() => {
      this.isSyncingPause = false;
    }, 0);
  }
  
  /**
   * Get the current playback time of the main media element
   */
  public get currentTime(): number {
    if (this.mediaElements.length === 0) {
      Logger.error("No media elements available to get currentTime");
      return 0;
    }
    
    // Return the currentTime of the first (main) media element
    const mainElement = this.mediaElements.find(media => media.isMain);
    
    if (mainElement) {
      return mainElement.element.currentTime;
    }
    
    return this.mediaElements[0].element.currentTime;
  }
  
  /**
   * Set the current playback time for all media elements
   */
  public set currentTime(time: number) {
    // Use the seekTracks method to handle the seeking
    this.seekTracks(this.mediaElements, time);
  }
}
