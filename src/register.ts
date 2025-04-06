/**
 * Self-registering module that defines the custom element
 */
import { MediaSync } from './media-sync';

// Register the custom element if it's not already defined
if (!customElements.get('media-sync')) {
  customElements.define('media-sync', MediaSync);
}

export { MediaSync };
export default MediaSync;