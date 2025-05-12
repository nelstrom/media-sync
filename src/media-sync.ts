import { MediaEvent, SEEK_DEBOUNCE_DELAY, type MediaEventName, type ReadyState } from "./constants";
import { MediaElementWrapper } from "./media-element-wrapper";
import { Logger } from "./utils";

// Import HTMLMediaElement readyState constants
const { 
  HAVE_NOTHING,
  HAVE_METADATA, 
  HAVE_CURRENT_DATA, 
  HAVE_FUTURE_DATA, 
  HAVE_ENOUGH_DATA 
} = HTMLMediaElement;

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

// Define a union type for tracking drift or ended state
type DriftInfo = 
  | { id: string; delta: number; ended?: false } // Track is playing, with drift
  | { id: string; delta?: never; ended: true }   // Track has ended (shorter than main)

interface DriftSample extends DriftRecord {
  type: 'sample';
  drifts: DriftInfo[];
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
  // Private properties
  private mediaElements: MediaElementWrapper[] = [];
  private isSyncingSeeking: boolean = false;
  private lastReadyState: ReadyState = HAVE_NOTHING;
  private isWaitingForData: boolean = false;
  private driftSamplingIntervalId: number | null = null;
  private driftCorrectionIntervalId: number | null = null;
  private audioContext: AudioContext | null = null;
  private useWebAudio: boolean = true; // Use Web Audio API for all browsers
  private _disabled: boolean = false;
  
  // Public properties
  public driftSamples: (DriftSample | DriftCorrection)[] = [];
  public driftCorrectionEnabled: boolean = true;
  
  // Static properties
  static get observedAttributes() {
    return ['disabled'];
  }

  // Constructor
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

  // Public getters and setters
  
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
   * Get the current playback time of the main media element
   */
  public get currentTime(): number {
    if (this.mediaElements.length === 0) {
      Logger.error("No media elements available to get currentTime");
      return 0;
    }
    
    return this.mainElement.currentTime;
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
   * Get the readyState of the MediaSync element
   * Returns the lowest readyState value of all media elements
   */
  public get readyState(): ReadyState {
    if (this.mediaElements.length === 0) {
      Logger.debug("No media elements available to get readyState");
      return 0;
    }
    
    // Find the minimum readyState among all media elements
    // Use type assertion since TS doesn't know Math.min preserves the ReadyState type
    return Math.min(...this.mediaElements.map(media => media.readyState)) as ReadyState;
  }

  /**
   * Get the paused state of the media sync
   * Returns true if the main element is paused
   */
  public get paused(): boolean {
    if (this.mediaElements.length === 0) {
      Logger.error("No media elements available to get paused state");
      return true;
    }
    
    return this.mainElement.paused;
  }
  
  /**
   * Get the playback rate from the main media element
   */
  public get playbackRate(): number {
    if (this.mediaElements.length === 0) {
      Logger.error("No media elements available to get playbackRate");
      return 1.0;
    }
    
    return this.mainElement.playbackRate;
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
   * Get the duration of the media sync element
   * Returns the duration of the main element
   */
  public get duration(): number {
    if (this.mediaElements.length === 0) {
      Logger.error("No media elements available to get duration");
      return 0;
    }
    
    return this.mainElement.duration;
  }
  
  /**
   * Get the ended state of the media sync element
   * Returns true if the main element has ended
   */
  public get ended(): boolean {
    if (this.mediaElements.length === 0) {
      Logger.error("No media elements available to get ended state");
      return false;
    }
    
    return this.mainElement.ended;
  }

  // Public methods
  
  /**
   * Initialize the media sync element
   * @param mediaElements Optional array of HTMLMediaElements to use instead of finding them in the DOM
   * @returns Array of MediaElementWrapper instances created
   */
  public initialize(mediaElements?: HTMLMediaElement[]): MediaElementWrapper[] {
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

  // Lifecycle methods
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

  // Private methods
  
  /**
   * Check if any media element is currently playing
   */
  private isAnyMediaPlaying(): boolean {
    return this.mediaElements.some(media => !media.paused);
  }
  
  /**
   * Get the main media element (or first one if no main element is designated)
   */
  private get mainElement(): MediaElementWrapper {
    return this.mediaElements.find(media => media.isMain) || this.mediaElements[0];
  }

  /**
   * Returns all media wrappers except the specified one
   * @param wrapperToExclude The media wrapper to exclude from the result
   */
  private otherTracks(wrapperToExclude: MediaElementWrapper): MediaElementWrapper[] {
    return this.mediaElements.filter(wrapper => {
      return wrapper !== wrapperToExclude;
    });
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
    
    // Get the main element
    const mainElement = this.mainElement;
    const mainTime = mainElement.currentTime;
    
    // Skip if main element is not playing
    if (mainElement.paused) {
      return;
    }
    
    // Calculate drift for each track relative to the main track
    const drifts = this.mediaElements.map(media => {
      // Check if this track has ended (shorter than main track)
      if (media !== mainElement && media.ended) {
        Logger.debug(`Track ${media.id} has ended, recording as ended in drift sample`);
        return {
          id: media.id,
          ended: true
        } as const; // Use const assertion to tell TypeScript this is exactly { ended: true }
      }
      
      // Calculate drift in milliseconds and round to nearest integer
      const delta = (media === mainElement) ? 
        0 : // No drift for the main track
        Math.round((media.currentTime - mainTime) * 1000);
      
      return {
        id: media.id,
        delta: delta,
        ended: false
      } as const; // Use const assertion to tell TypeScript this is exactly { delta: number, ended: false }
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
    
    // Get the main element
    const mainElement = this.mainElement;
    const mainTime = mainElement.currentTime;
    
    // Skip correction if main element is not playing
    if (mainElement.paused) {
      return;
    }
    
    // Find tracks that have drifted beyond the threshold
    // Skip any tracks that have already ended - we can't correct them
    const driftedTracks = this.otherTracks(mainElement).filter(media => {
      // Skip ended tracks
      if (media.ended) {
        Logger.debug(`Skipping drift correction for track ${media.id} because it has ended`);
        return false;
      }
      
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
   * Handle readyState changes and dispatch appropriate events
   */
  private handleReadyStateChange(): void {
    const currentReadyState = this.readyState;
    
    // If the overall readyState has changed, dispatch the appropriate event
    if (currentReadyState !== this.lastReadyState) {
      Logger.debug(`MediaSync readyState changed from ${this.lastReadyState} to ${currentReadyState}`);
      this.lastReadyState = currentReadyState;
      
      // Dispatch appropriate event based on new readyState
      switch (currentReadyState) {
        case HAVE_NOTHING:
          this.dispatchEvent(new CustomEvent('emptied', { 
            bubbles: true, 
            composed: true 
          }));
          break;
        case HAVE_METADATA:
          this.dispatchEvent(new CustomEvent('loadedmetadata', { 
            bubbles: true, 
            composed: true 
          }));
          break;
        case HAVE_CURRENT_DATA:
          this.dispatchEvent(new CustomEvent('loadeddata', { 
            bubbles: true, 
            composed: true 
          }));
          break;
        case HAVE_FUTURE_DATA:
          this.dispatchEvent(new CustomEvent('canplay', { 
            bubbles: true, 
            composed: true 
          }));
          break;
        case HAVE_ENOUGH_DATA:
          this.dispatchEvent(new CustomEvent('canplaythrough', { 
            bubbles: true, 
            composed: true 
          }));
          
          // When all tracks reach HAVE_ENOUGH_DATA state, we can resume if needed
          if (this.isWaitingForData && !this._disabled) {
            Logger.debug('All tracks have enough data to play');
            
            // Resume playback if not currently paused
            if (!this.paused) {
              Logger.debug('Resuming playback after waiting');
              this.play();
            }
            
            // Clear waiting flag
            this.isWaitingForData = false;
          }
          break;
      }
    }
  }

  /**
   * Set up media elements for synchronization
   */
  private setupMediaElements(
    elements: HTMLMediaElement[],
    mainElement: HTMLMediaElement
  ): MediaElementWrapper[] {
    // Set up all media elements first
    const wrappers = elements.map((element, index) => {
      const isMain = element === mainElement;

      const wrapper = new MediaElementWrapper(element, {
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
        
        // Forward the seeking event to listeners on the MediaSync element
        this.dispatchEvent(new CustomEvent('seeking', {
          bubbles: true,
          composed: true,
          detail: { currentTime: seekTime }
        }));
        
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
        
        // Check if all tracks have sufficient readyState to play
        const currentReadyState = this.readyState;
        if (currentReadyState < HAVE_ENOUGH_DATA) {
          Logger.debug(`Media element played directly but overall readyState is ${currentReadyState}. Pausing this element.`);
          
          // Pause the element that tried to play
          this.suppressEvents(MediaEvent.pause);
          wrapper.pause();
          
          // Re-enable pause events
          setTimeout(() => {
            this.enableEvents(MediaEvent.pause);
          }, 0);
          
          return;
        }
        
        // Forward the play event to listeners on the MediaSync element
        this.dispatchEvent(new CustomEvent('play', {
          bubbles: true,
          composed: true
        }));
        
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
        
        // Check if this pause event was triggered because the track reached its end
        // If it's ended, we should NOT propagate the pause to other tracks
        if (wrapper.ended) {
          Logger.debug(`Ignoring pause event from element ${index} because it reached the end of its duration`);
          return;
        }
        
        // Forward the pause event to listeners on the MediaSync element
        this.dispatchEvent(new CustomEvent('pause', {
          bubbles: true,
          composed: true
        }));
        
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
        
        // Forward the ratechange event to listeners on the MediaSync element
        this.dispatchEvent(new CustomEvent('ratechange', {
          bubbles: true,
          composed: true,
          detail: { playbackRate }
        }));
        
        // Find other media elements (not this one) to change rate
        const othersToChange = this.otherTracks(wrapper);
        Logger.debug(`Updating playback rate to ${playbackRate} for ${othersToChange.length} other media elements (excluding source element)`);
        this.setPlaybackRateTracks(othersToChange, playbackRate);
      });
      
      // Add listeners for readyState-related events
      // Each time an element's readyState changes, we need to check the overall readyState
      wrapper.addEventListener(MediaEvent.emptied, () => {
        this.handleReadyStateChange();
      });
      
      wrapper.addEventListener(MediaEvent.loadedmetadata, () => {
        this.handleReadyStateChange();
      });
      
      wrapper.addEventListener(MediaEvent.loadeddata, () => {
        this.handleReadyStateChange();
      });
      
      wrapper.addEventListener(MediaEvent.canplay, () => {
        this.handleReadyStateChange();
      });
      
      wrapper.addEventListener(MediaEvent.canplaythrough, () => {
        this.handleReadyStateChange();
      });
      
      // Handle waiting events (when playback stops due to lack of data)
      wrapper.addEventListener(MediaEvent.waiting, () => {
        Logger.debug(`Waiting event from element ${index}`);
        
        // Mark that we're waiting for data
        this.isWaitingForData = true;
        
        // Pause all tracks to prevent playing while others are buffering
        this.pause();
        
        // Forward the waiting event to listeners on the MediaSync element
        this.dispatchEvent(new CustomEvent('waiting', {
          bubbles: true,
          composed: true,
        }));
      });
      
      // Handle ended events (when a track finishes playing)
      wrapper.addEventListener(MediaEvent.ended, () => {
        Logger.debug(`Ended event from element ${index}`);
        
        if (isMain) {
          Logger.debug('Main track ended, forwarding ended event');
          
          // Pause all other tracks when the main track ends
          if (!this._disabled) {
            const otherTracks = this.otherTracks(wrapper);
            this.pauseTracks(otherTracks);
          }
          
          // Forward the ended event to listeners on the MediaSync element
          this.dispatchEvent(new CustomEvent('ended', {
            bubbles: true,
            composed: true
          }));
        } else {
          // For non-main tracks that end before the main track, we just let them stay paused
          Logger.debug(`Non-main track ${index} ended before main track`);
        }
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
      const allPlaying = this.mediaElements.every(media => !media.paused);
      if (allPlaying) {
        this.startDriftSampling();
        this.startDriftCorrection();
      }
    }, SEEK_DEBOUNCE_DELAY * 2);
  }

  /**
   * Suppress events of the specified type on all media elements
   * @param eventType The event type to suppress
   */
  private suppressEvents(eventType: MediaEventName): void {
    this.mediaElements.forEach((wrapper) => wrapper.suppressEventType(eventType));
  }

  /**
   * Enable events of the specified type on all media elements
   * @param eventType The event type to enable
   */
  private enableEvents(eventType: MediaEventName): void {
    this.mediaElements.forEach((wrapper) => wrapper.enableEventType(eventType));
  }

  private async playTracks(mediaElements = this.mediaElements): Promise<void> {
    if (mediaElements.length === 0) {
      Logger.error("No media elements available to play");
      return;
    }

    try {
      Logger.debug(`MediaSync: Playing ${mediaElements.length} media elements`);
      
      // Check if all tracks have sufficient readyState to play
      const currentReadyState = this.readyState;
      if (currentReadyState < HAVE_ENOUGH_DATA) {
        Logger.debug(`Cannot play yet - readyState is ${currentReadyState} but need ${HAVE_ENOUGH_DATA} (HAVE_ENOUGH_DATA)`);
        return;
      }
      
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
      const allPlaying = this.mediaElements.every(media => !media.paused);
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