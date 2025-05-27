## TODO

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
- [X] refactor tests: media-sync test should test integration between media-sync and media-element-wrapper (without interacting with the MediaElements themselves). media-element-wrapper test should test integration between the wrapper and the media-element itself.
- [X] replace `isSyncing{Play,Pause,Sync}` in media-sync with equivalent in media-element-wrapper. When syncing one media-element, media-sync would set other elements into a state where they don't emit events, until the sync is complete
- [ ] refine drift correction with playbackRate tweaking for small discrepancies (and seeking for big discrepancies)
- [X] add a boolean loop attribute/property to `media-sync` (mirror this against the main media element, and prevent non-main media elements from having loop enabled)
- [X] add a readyState property (getter only) for media-sync. It should do `Math.min(mediaElements.map(e => e.readyState))`
- [ ] in Safari, experiment with using `mediaGroup`: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/mediaGroup - https://developer.apple.com/documentation/webkitjs/mediacontroller
- [X] handle loading and readiness states
- [ ] use a data- attribute to enable/disable debug logging
