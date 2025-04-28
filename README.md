# Media Sync

The `<media-sync>` custom element plays `<audio>` and `<video>` tracks in synchronisation. Pressing play for one track causes all synched tracks to start playing together. When one track is paused, they all pause. When one track is scrubbed to a particular timestamp, they all scrub to the same timestamp.

Synchronisation applies to the timing and playback of tracks, but it's possible to control the volume of individual tracks independently. This means that you can adjust the 'mix' by tweaking the levels.

The `<media-sync>` element can be used to combine individual musical parts so that they can be played back together, allowing the consumer to adjust the 'mix' so that they can focus on parts of interest. This is a useful tool for teaching different vocal parts for a choir.

Example usage:

```html
<media-sync>
  <video controls poster="/images/poster.png">
    <source src="ensemble.mp4" type="video/mp4" />
    <source src="ensemble.ogv" type="video/ogv" />
  </video>
  <audio controls>
    <source src="part-1.mp3" />
  </audio>
  <audio controls>
    <source src="part-2.mp3" />
  </audio>
</media-sync>
```

This example features one video track and two audio tracks. In this example, controls are present for each track, so pressing play or pause on any one of these would cause all tracks to play or pause.

## Media constraints

The `<media-sync>` element works on the assumption that all provided tracks have the same duration. Typically, these media tracks would be created together in a dedicated video or audio editing program.

## Challenges

- [X] play/pause any track causes all tracks to play/pause
- [X] while playing: manually scrubbing any track causes all tracks to scrub
- [X] while paused: manually scrubbing any track causes all tracks to scrub
- [X] setting `currentTime` on any track causes all tracks to sync to that timestamp
- [X] give media-sync element a similar interface to media elements (play, pause, currentTime)
- [X] ~~make impossible states impossible (wrt to syncing)~~
- [X] periodically check deltas and re-sync to correct any drift
- [X] consider calling `dispatchEvent()` from the Wrapper, not the element (and attaching listeners to the wrapper, not the element)
- [X] add a disabled property/attribute
- [X] give media-element-wrapper a similar interface to media elements (play, pause, currentTime)
- [ ] refactor tests: media-sync test should test integration between media-sync and media-element-wrapper (without interacting with the MediaElements themselves). media-element-wrapper test should test integration between the wrapper and the media-element itself.
- [ ] replace `isSyncing{Play,Pause,Sync}` in media-sync with equivalent in media-element-wrapper. When syncing one media-element, media-sync would set other elements into a state where they don't emit events, until the sync is complete
- [ ] add a boolean loop attribute/property to `media-sync` (mirror this against the main media element, and prevent non-main media elements from having loop enabled)
- [ ] add a readyState property (getter only) for media-sync. It should do `Math.min(mediaElements.map(e => e.readyState))`
- [ ] handle loading and readiness states
- [ ] use a data- attribute to enable/disable debug logging
- [ ] intentionally delete code in ways that don't cause the tests to fail. Ask GenAI to add tests to catch these blind-spots

### sync-video-player inspired approach

Main/Secondary control structure.

'timeupdate' events from main element cause other parts to be seeked to match (if their delta exceeds a threshold).

play/pause/seek events are 

## Preferred approach

play event from any track causes all tracks to play
pause event from any track causes all tracks to pause
user-seek event from any track causes all tracks to seek
program-seek event goes into a sub-state where all tracks are synced (without causing infinite loops)

Use requestAnimationFrame to schedule delta-checks