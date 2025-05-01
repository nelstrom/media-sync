import { MediaEvent, SEEK_DEBOUNCE_DELAY } from "./constants";
import { MediaElementWrapperImpl } from "./media-element-wrapper";
import { MediaElementWrapper, SuppressibleEventName } from "./types";
import { Logger } from "./utils";

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
  private isSyncingSeeking: boolean = false;
  
  // Drift sampling properties
  public driftSamples: (DriftSample | DriftCorrection)[] = [];
  private driftSamplingIntervalId: number | null = null;
  
  // Drift correction properties
  private driftCorrectionIntervalId: number | null = null;
  public driftCorrectionEnabled: boolean = true;
  
  // Web Audio API integration
  private audioContext: AudioContext | null = null;
  private useWebAudio: boolean = true; // Use Web Audio API for all browsers
  
  // Boolean property to disable synchronization
  private _disabled: boolean = false;
  
  // Define observed attributes for the element
  static get observedAttributes() {
    return ['disabled'];
  }

  constructor() {
    super();
    Logger.debug("MediaSync: Initializing");
    
    // Check for disabled attribute in constructor
    if (this.hasAttribute('disabled')) {
      this._disabled = true;
      Logger.debug("MediaSync: Disabled by attribute");
    }
    
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
   * Called when attributes are changed, added, or removed
   */
  attributeChangedCallback(name: string, _oldValue: string, newValue: string): void {
    if (name === 'disabled') {
      // Convert attribute value to boolean
      this._disabled = newValue !== null;
      Logger.debug(`MediaSync: ${this._disabled ? 'Disabled' : 'Enabled'} synchronization`);
      
      if (this._disabled) {
        // If disabled, stop all synchronization
        this.stopDriftSampling();
        this.stopDriftCorrection();
        // Disconnect from Web Audio API
        this.cleanupAudioContext();
      } else if (this.isAnyMediaPlaying()) {
        // If enabled and media is playing, restart synchronization
        this.startDriftSampling();
        this.startDriftCorrection();
        // Reinitialize Web Audio API
        this.initAudioContext();
      }
    }
  }
  
  /**
   * Check if any media element is currently playing
   */
  private isAnyMediaPlaying(): boolean {
    return this.mediaElements.some(media => media.isPlaying());
  }
  
  /**
   * Get the disabled state
   */
  get disabled(): boolean {
    return this._disabled;
  }
  
  /**
   * Set the disabled state
   */
  set disabled(value: boolean) {
    if (this._disabled !== value) {
      this._disabled = value;
      
      // Update the attribute to match the property
      if (value) {
        this.setAttribute('disabled', '');
      } else {
        this.removeAttribute('disabled');
      }
    }
  }
  
  /**
   * Initialize the Web Audio API context
   */
  private initAudioContext(): void {
    // Early return if disabled, audio already initialized, or audio API not used
    if (this._disabled || !this.useWebAudio || this.audioContext) {
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
    // Don't start if disabled or already sampling
    if (this._disabled || this.driftSamplingIntervalId !== null) {
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
    // Skip if disabled or not enough media elements
    if (this._disabled || this.mediaElements.length <= 1) {
      return; // Need at least 2 media elements to measure drift
    }
    
    // Find the main element
    const mainElement = this.mediaElements.find(media => media.isMain) || this.mediaElements[0];
    const mainTime = mainElement.currentTime;
    
    // Skip if main element is not playing
    if (mainElement.isPaused()) {
      return;
    }
    
    // Calculate drift for each track relative to the main track
    const drifts = this.mediaElements.map(media => {
      // Calculate drift in milliseconds and round to nearest integer
      const delta = (media === mainElement) ? 
        0 : // No drift for the main track
        Math.round((media.currentTime - mainTime) * 1000);
      
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
    // Don't start if disabled, already running, or if correction is disabled
    if (this._disabled || this.driftCorrectionIntervalId !== null || !this.driftCorrectionEnabled) {
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
    // Skip if disabled or not enough media elements
    if (this._disabled || this.mediaElements.length <= 1) {
      return; // Need at least 2 media elements to correct drift
    }
    
    // Skip if we're already in a seeking operation
    if (this.isSyncingSeeking) {
      return;
    }
    
    // Find the main element
    const mainElement = this.mediaElements.find(media => media.isMain) || this.mediaElements[0];
    const mainTime = mainElement.currentTime;
    
    // Skip correction if main element is not playing
    if (mainElement.isPaused()) {
      return;
    }
    
    // Find tracks that have drifted beyond the threshold
    const driftedTracks = this.otherTracks(mainElement).filter(media => {
      const drift = Math.abs(Math.round((media.currentTime - mainTime) * 1000));
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
   * @param mediaElements Optional array of HTMLMediaElements to use instead of finding them in the DOM
   * @returns Array of MediaElementWrapperImpl instances created
   */
  public initialize(mediaElements?: HTMLMediaElement[]): MediaElementWrapperImpl[] {
    // If no media elements are provided, find all media elements that are children of this element
    if (!mediaElements) {
      mediaElements = [...this.querySelectorAll("audio, video")] as HTMLMediaElement[];
    }

    if (mediaElements.length === 0) {
      Logger.error("No media elements found in MediaSync container");
      return [];
    }

    // The first element is designated as the main one (controlling sync)
    return this.setupMediaElements(mediaElements, mediaElements[0]);
  }

  /**
   * Set up media elements for synchronization
   */
  private setupMediaElements(
    elements: HTMLMediaElement[],
    mainElement: HTMLMediaElement
  ): MediaElementWrapperImpl[] {
    // Set up all media elements first
    const wrappers = elements.map((element, index) => {
      const isMain = element === mainElement;

      const wrapper = new MediaElementWrapperImpl(element, {
        isMain,
      });

      // Handle seeking events
      wrapper.addEventListener(MediaEvent.seeking, (e) => {
        Logger.debug(`Seeking event from element ${index}`);
        
        // Skip synchronization if disabled
        if (this._disabled) {
          Logger.debug("Synchronization is disabled, skipping seek sync");
          return;
        }
        
        // Skip if we're already in a seeking operation to prevent loops
        if (this.isSyncingSeeking) {
          Logger.debug("Already in a seeking operation, skipping");
          return;
        }
        
        // Get time from event detail if available, otherwise use element's currentTime
        const seekTime = (e as CustomEvent)?.detail?.currentTime ?? element.currentTime;
        
        // Get all tracks except the source and seek them
        const targetTracks = this.otherTracks(wrapper);
        this.seekTracks(targetTracks, seekTime);
      });


      // Handle play events
      wrapper.addEventListener(MediaEvent.play, () => {
        Logger.debug(`Play event from element ${index}`);
        
        // Skip synchronization if disabled
        if (this._disabled) {
          Logger.debug("Synchronization is disabled, skipping play sync");
          return;
        }
        
        // Find other media elements (not this one) to play
        const othersToPlay = this.otherTracks(wrapper);
        Logger.debug(`Playing ${othersToPlay.length} other media elements (excluding source element)`);
        this.playTracks(othersToPlay);
      });

      wrapper.addEventListener(MediaEvent.pause, () => {
        Logger.debug(`Pause event from element ${index}`);
        
        // Skip synchronization if disabled
        if (this._disabled) {
          Logger.debug("Synchronization is disabled, skipping pause sync");
          return;
        }
        
        
        const othersToPause = this.otherTracks(wrapper);
        this.pauseTracks(othersToPause);
      });

      // Handle playback rate change events
      wrapper.addEventListener(MediaEvent.ratechange, (e) => {
        const customEvent = e as CustomEvent;
        const playbackRate = customEvent.detail.playbackRate;
        Logger.debug(`Ratechange event from element ${index}: ${playbackRate}`);
        
        // Skip synchronization if disabled
        if (this._disabled) {
          Logger.debug("Synchronization is disabled, skipping playback rate sync");
          return;
        }
        
        // Find other media elements (not this one) to change rate
        const othersToChange = this.otherTracks(wrapper);
        Logger.debug(`Updating playback rate to ${playbackRate} for ${othersToChange.length} other media elements (excluding source element)`);
        this.setPlaybackRateTracks(othersToChange, playbackRate);
      });

      if (isMain) {
        Logger.debug(`Set element ${index} as main media element`);
      }
      return wrapper;
    });
    
    // Store all created wrappers
    this.mediaElements = wrappers;

    // Initialize Web Audio API after all media elements are set up
    if (this.useWebAudio) {
      // Use a small delay to ensure all media elements are properly registered
      setTimeout(() => this.initAudioContext(), 0);
    }

    return wrappers;
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
    
    // Skip synchronization if disabled
    if (this._disabled) {
      Logger.debug("Synchronization is disabled, skipping seek sync");
      return;
    }
    
    Logger.debug(`Seeking ${mediaElements.length} media elements to ${time}s`);
    
    // Stop drift sampling and correction during seeking to avoid misleading data
    this.stopDriftSampling();
    this.stopDriftCorrection();
    
    // Suppress seeking events to prevent infinite looping
    this.suppressEvents(MediaEvent.seeking);
    
    // Set flag to indicate we're in a seeking operation
    this.isSyncingSeeking = true;
    
    // Seek all specified media elements
    mediaElements.forEach(media => {
      media.currentTime = time;
    });
    
    // Reset flag and re-enable events after a short delay to prevent race conditions
    setTimeout(() => {
      this.isSyncingSeeking = false;
      this.enableEvents(MediaEvent.seeking);
      
      // If all elements are playing after seeking, restart drift sampling and correction
      const allPlaying = this.mediaElements.every(media => media.isPlaying());
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
    // No-op if disabled
    if (this._disabled) {
      Logger.debug("MediaSync is disabled, play() is a no-op");
      return;
    }
    
    await this.playTracks();
  }

  /**
   * Returns all media wrappers except the specified one
   * @param wrapperToExclude The media wrapper to exclude from the result
   */
  private otherTracks(wrapperToExclude: MediaElementWrapper): MediaElementWrapper[] {
    // Get the underlying element from the wrapper we want to exclude
    // We need to do this for test environments where wrapper instances might not match
    const elementToExclude = (wrapperToExclude as any)._element;
    
    return this.mediaElements.filter(wrapper => {
      // Try both approaches - direct wrapper equality AND element equality
      // This ensures it works both in production and test environments
      const directMatch = wrapper === wrapperToExclude;
      const elementMatch = (wrapper as any)._element === elementToExclude;
      
      // If either match, exclude this wrapper
      return !directMatch && !elementMatch;
    });
  }

  private async playTracks(mediaElements = this.mediaElements): Promise<void> {
    if (mediaElements.length === 0) {
      Logger.error("No media elements available to play");
      return;
    }

    try {
      Logger.debug(`MediaSync: Playing ${mediaElements.length} media elements`);
      
      // Suppress play events to prevent infinite looping
      this.suppressEvents(MediaEvent.play);
      
      // When using Web Audio API, ensure the audio context is resumed
      if (this.useWebAudio && this.audioContext && this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
        Logger.debug("Resumed audio context");
      }

      // Play all media elements
      const playPromises = mediaElements.map((media) => media.play());

      // Wait for all play operations to complete
      await Promise.all(playPromises);
      
      // Start drift sampling and correction if all tracks are playing
      const allPlaying = this.mediaElements.every(media => media.isPlaying());
      if (allPlaying) {
        this.startDriftSampling();
        this.startDriftCorrection();
      }

      // Re-enable events after all play operations are complete
      setTimeout(() => {
        this.enableEvents(MediaEvent.play);
      }, 0);
    } catch (error) {
      Logger.error("Error playing media elements:", error);
      // Make sure to re-enable events even if there's an error
      this.enableEvents(MediaEvent.play);
    }
  }

  /**
   * Pause all media elements
   */
  public pause(): void {
    // No-op if disabled
    if (this._disabled) {
      Logger.debug("MediaSync is disabled, pause() is a no-op");
      return;
    }
    
    this.pauseTracks();
  }

  /**
   * Suppress events of the specified type on all media elements
   * @param eventType The event type to suppress
   */
  private suppressEvents(eventType: SuppressibleEventName): void {
    this.mediaElements.forEach((wrapper) => wrapper.suppressEventType(eventType));
  }

  /**
   * Enable events of the specified type on all media elements
   * @param eventType The event type to enable
   */
  private enableEvents(eventType: SuppressibleEventName): void {
    this.mediaElements.forEach((wrapper) => wrapper.enableEventType(eventType));
  }

  private pauseTracks(mediaElements = this.mediaElements): void {
    if (mediaElements.length === 0) {
      Logger.error("No media elements available to pause");
      return;
    }

    Logger.debug("MediaSync: Pausing all media elements");

    // Suppress pause events to prevent infinite looping
    this.suppressEvents(MediaEvent.pause);

    // Pause all media elements - this is synchronous
    mediaElements.forEach((media) => media.pause());
    
    // Stop drift sampling and correction when pausing
    this.stopDriftSampling();
    this.stopDriftCorrection();

    // Use setTimeout to ensure this runs after the current execution cycle
    setTimeout(() => {
      this.enableEvents(MediaEvent.pause);
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
      return mainElement.currentTime;
    }
    
    return this.mediaElements[0].currentTime;
  }
  
  /**
   * Set the current playback time for all media elements
   */
  public set currentTime(time: number) {
    // No-op if disabled
    if (this._disabled) {
      Logger.debug("MediaSync is disabled, setting currentTime is a no-op");
      return;
    }
    
    // Use the seekTracks method to handle the seeking for all elements
    this.seekTracks(this.mediaElements, time);
  }

  /**
   * Get the playback rate from the main media element
   */
  public get playbackRate(): number {
    if (this.mediaElements.length === 0) {
      Logger.error("No media elements available to get playbackRate");
      return 1.0;
    }
    
    // Return the playbackRate of the first (main) media element
    const mainElement = this.mediaElements.find(media => media.isMain);
    
    if (mainElement) {
      return mainElement.playbackRate;
    }
    
    return this.mediaElements[0].playbackRate;
  }
  
  /**
   * Set the playback rate for all media elements
   */
  public set playbackRate(rate: number) {
    // No-op if disabled
    if (this._disabled) {
      Logger.debug("MediaSync is disabled, setting playbackRate is a no-op");
      return;
    }
    
    // Use the setPlaybackRateTracks method to handle updating the rate for all elements
    this.setPlaybackRateTracks(this.mediaElements, rate);
  }

  /**
   * Set the playback rate for a set of media elements
   * @param mediaElements The media elements to update (defaults to all elements)
   * @param rate The playback rate to set
   */
  private setPlaybackRateTracks(mediaElements = this.mediaElements, rate: number): void {
    if (mediaElements.length === 0) {
      Logger.error("No media elements available to set playback rate");
      return;
    }
    
    // Skip synchronization if disabled
    if (this._disabled) {
      Logger.debug("Synchronization is disabled, skipping playback rate sync");
      return;
    }
    
    Logger.debug(`Setting playback rate of ${mediaElements.length} media elements to ${rate}`);
    
    // Suppress ratechange events to prevent infinite looping
    this.suppressEvents(MediaEvent.ratechange);
    
    // Set playback rate for all specified media elements
    mediaElements.forEach(media => {
      media.playbackRate = rate;
    });
    
    // Re-enable events after a short delay to prevent race conditions
    setTimeout(() => {
      this.enableEvents(MediaEvent.ratechange);
    }, 10);
  }
}
