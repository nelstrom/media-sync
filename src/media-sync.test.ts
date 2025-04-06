import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { MediaSync } from './media-sync';

describe('MediaSync', () => {
  let mediaSyncElement: MediaSync;

  // Register the custom element before running tests
  beforeAll(() => {
    if (!customElements.get('media-sync')) {
      customElements.define('media-sync', MediaSync);
    }
  });

  // Mock HTMLMediaElement methods and properties that aren't implemented in jsdom
  beforeEach(() => {
    // Mock HTMLMediaElement methods
    
    // Mock play and pause methods
    HTMLMediaElement.prototype.play = vi.fn().mockImplementation(() => Promise.resolve());
    HTMLMediaElement.prototype.pause = vi.fn().mockImplementation(() => {});
    
    // Define currentTime and duration getters/setters
    Object.defineProperties(HTMLMediaElement.prototype, {
      currentTime: {
        get: function() { return this._currentTime || 0; },
        set: function(value) { this._currentTime = value; }
      },
      duration: {
        get: function() { return this._duration || 100; },
        set: function(value) { this._duration = value; }
      }
    });
    
    // Create a new MediaSync element
    mediaSyncElement = document.createElement('media-sync') as MediaSync;
    
    document.body.appendChild(mediaSyncElement);
  });
  
  afterEach(() => {
    document.body.removeChild(mediaSyncElement);
    vi.restoreAllMocks();
  });
  
  it('should initialize correctly', () => {
    expect(mediaSyncElement).toBeInstanceOf(MediaSync);
  });
  
  it('should create a MediaSync instance', () => {
    // Simple test to verify the custom element is properly defined
    const mediaSync = customElements.get('media-sync');
    expect(mediaSync).toBeDefined();
    expect(mediaSync?.name).toBe('MediaSync');
  });
});