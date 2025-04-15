import { CustomEventNames } from "./constants";
import { MediaElementWrapperImpl } from "./media-element-wrapper";
import { MediaElementWrapper } from "./types";
import { Logger, debounce } from "./utils";

// Debounce delay for seeking events (in milliseconds)
const SEEK_DEBOUNCE_DELAY = 10;

// Sample every 100ms (10 samples per second)
const DRIFT_SAMPLE_INTERVAL = 100;

// Detect Safari browser
const isSafari = typeof navigator !== 'undefined' && 
  /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// Correct drift every 200ms (5 times per second)
const DRIFT_CORRECTION_INTERVAL = 200;

// Threshold in milliseconds - only correct if drift exceeds this value
// Use a higher threshold for Safari due to its different media handling
const DRIFT_CORRECTION_THRESHOLD = isSafari ? 150 : 30;

// Interface for drift samples and corrections
interface DriftRecord {
  type: 'sample' | 'correction';
  currentTime: number;    // Main track's currentTime
}

interface DriftSample extends DriftRecord {
  type: 'sample';
  drifts: {
    id: string;
    delta: number;        // Drift in milliseconds (relative to main)
  }[];
}

interface DriftCorrection extends DriftRecord {
  type: 'correction';
  corrections: {
    id: string;
    correcting: boolean;
  }[];
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
  public driftSamples: (DriftSample | DriftCorrection)[] = [];
  private driftSamplingIntervalId: number | null = null;
  
  // Drift correction properties
  private driftCorrectionIntervalId: number | null = null;
  public driftCorrectionEnabled: boolean = true;
  
  // Web Audio API integration
  private audioContext: AudioContext | null = null;
  private useWebAudio: boolean = true; // Use Web Audio API for all browsers

  constructor() {
    super();
    Logger.debug("MediaSync: Initializing");
    Logger.debug("Using Web Audio API for precise synchronization");
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
    // Stop drift sampling and correction when disconnected
    this.stopDriftSampling();
    this.stopDriftCorrection();
    
    // Clean up Web Audio API resources
    this.cleanupAudioContext();
  }
  
  /**
   * Initialize the Web Audio API context
   */
  private initAudioContext(): void {
    if (!this.useWebAudio || this.audioContext) {
      return;
    }
    
    try {
      // Check if we're in a browser environment
      if (typeof window === 'undefined' || !window.AudioContext && !(window as any).webkitAudioContext) {
        // We're likely in a test environment
        Logger.debug("Web Audio API not available - likely in test environment");
        this.useWebAudio = false;
        return;
      }
      
      // Create a new audio context
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextClass();
      
      // Connect all media elements to the audio context
      this.mediaElements.forEach(media => {
        media.connectToAudioContext(this.audioContext!);
      });
      
      Logger.debug("Web Audio API context initialized");
    } catch (error) {
      Logger.error("Failed to initialize Web Audio API:", error);
      this.useWebAudio = false;
    }
  }
  
  /**
   * Clean up the Web Audio API context
   */
  private cleanupAudioContext(): void {
    if (!this.audioContext) {
      return;
    }
    
    try {
      // Disconnect all media elements from the audio context
      this.mediaElements.forEach(media => {
        media.disconnectFromAudioContext();
      });
      
      // Close the audio context
      this.audioContext.close();
      this.audioContext = null;
      
      Logger.debug("Web Audio API context cleaned up");
    } catch (error) {
      Logger.error("Error cleaning up Web Audio API:", error);
    }
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
      // Calculate drift in milliseconds and round to nearest integer
      const delta = (media === mainElement) ? 
        0 : // No drift for the main track
        Math.round((media.element.currentTime - mainTime) * 1000);
      
      return {
        id: media.id,
        delta: delta
      };
    });
    
    // Record the sample
    this.driftSamples.push({
      type: 'sample',
      currentTime: mainTime,
      drifts: drifts
    });
  }
  
  /**
   * Start the drift correction mechanism
   */
  private startDriftCorrection(): void {
    // Don't start if already running or if correction is disabled
    if (this.driftCorrectionIntervalId !== null || !this.driftCorrectionEnabled) {
      return;
    }
    
    Logger.debug('Starting drift correction (up to 5 times per second)');
    
    this.driftCorrectionIntervalId = window.setInterval(() => {
      this.correctDrift();
    }, DRIFT_CORRECTION_INTERVAL);
  }
  
  /**
   * Stop the drift correction mechanism
   */
  private stopDriftCorrection(): void {
    if (this.driftCorrectionIntervalId !== null) {
      Logger.debug('Stopping drift correction');
      window.clearInterval(this.driftCorrectionIntervalId);
      this.driftCorrectionIntervalId = null;
    }
  }
  
  /**
   * Correct drift between tracks if it exceeds the threshold
   */
  private correctDrift(): void {
    if (this.mediaElements.length <= 1) {
      return; // Need at least 2 media elements to correct drift
    }
    
    // Skip if we're already in a seeking operation
    if (this.isSyncingSeeking) {
      return;
    }
    
    // Find the main element
    const mainElement = this.mediaElements.find(media => media.isMain) || this.mediaElements[0];
    const mainTime = mainElement.element.currentTime;
    
    // Skip correction if main element is not playing
    if (mainElement.element.paused) {
      return;
    }
    
    // Find tracks that have drifted beyond the threshold
    const driftedTracks = this.otherTracks(mainElement.element).filter(media => {
      const drift = Math.abs(Math.round((media.element.currentTime - mainTime) * 1000));
      return drift > DRIFT_CORRECTION_THRESHOLD;
    });
    
    // Only record corrections if we're actually correcting something
    if (driftedTracks.length > 0) {
      // Record the correction information
      const corrections = this.mediaElements.map(media => {
        return {
          id: media.id,
          correcting: driftedTracks.includes(media)
        };
      });
      
      // Add to drift samples
      this.driftSamples.push({
        type: 'correction',
        currentTime: mainTime,
        corrections: corrections
      });
    }
    
    // If we have any tracks that need correction, use the seekTracks method
    if (driftedTracks.length > 0) {
      Logger.debug(`Drift correction: ${driftedTracks.length} tracks exceeded ${DRIFT_CORRECTION_THRESHOLD}ms threshold`);
      this.seekTracks(driftedTracks, mainTime);
    }
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
    // Set up all media elements first
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
    
    // Initialize Web Audio API after all media elements are set up
    if (this.useWebAudio) {
      // Use a small delay to ensure all media elements are properly registered
      setTimeout(() => this.initAudioContext(), 0);
    }
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
    
    Logger.debug(`Seeking ${mediaElements.length} media elements to ${time}s`);
    
    // Stop drift sampling and correction during seeking to avoid misleading data
    this.stopDriftSampling();
    this.stopDriftCorrection();
    
    // Set flag to prevent infinite loops from programmatic seeking events
    this.isSyncingSeeking = true;
    
    // Seek all specified media elements
    mediaElements.forEach(media => {
      media.seekTo(time);
    });
    
    // Reset flag after a short delay to prevent race conditions
    setTimeout(() => {
      this.isSyncingSeeking = false;
      
      // If all elements are playing after seeking, restart drift sampling and correction
      const allPlaying = this.mediaElements.every(media => !media.element.paused);
      if (allPlaying) {
        this.startDriftSampling();
        this.startDriftCorrection();
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
      
      // When using Web Audio API, ensure the audio context is resumed
      if (this.useWebAudio && this.audioContext) {
        if (this.audioContext.state === 'suspended') {
          await this.audioContext.resume();
          Logger.debug("Resumed audio context");
        }
      }

      // Play all media elements
      const playPromises = mediaElements.map((media) => media.play());

      // Wait for all play operations to complete
      await Promise.all(playPromises);
      
      // Start drift sampling and correction if all tracks are playing
      const allPlaying = this.mediaElements.every(media => !media.element.paused);
      if (allPlaying) {
        this.startDriftSampling();
        this.startDriftCorrection();
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
    
    // Stop drift sampling and correction when pausing
    this.stopDriftSampling();
    this.stopDriftCorrection();

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
