# iOS Native Audio Plugin Implementation

This document describes how to implement the native audio plugin for iOS using AVPlayer.

## Setup

After running `npx cap add ios`, you'll need to create a custom Capacitor plugin.

### 1. Create the Plugin Class

Create `ios/App/App/NativeAudioPlugin.swift`:

```swift
import Capacitor
import AVFoundation
import MediaPlayer

@objc(NativeAudioPlugin)
public class NativeAudioPlugin: CAPPlugin {
    private var player: AVPlayer?
    private var playerItem: AVPlayerItem?
    private var timeObserver: Any?
    private var prefetchPlayer: AVPlayer?
    
    override public func load() {
        // Configure audio session for background playback
        do {
            try AVAudioSession.sharedInstance().setCategory(
                .playback,
                mode: .default,
                options: [.allowAirPlay, .allowBluetooth]
            )
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("Failed to configure audio session: \(error)")
        }
        
        // Setup remote command center
        setupRemoteCommandCenter()
        
        // Setup now playing info
        setupNowPlayingInfo()
    }
    
    @objc func play(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
              let url = URL(string: urlString) else {
            call.reject("Invalid URL")
            return
        }
        
        // Stop existing playback
        player?.pause()
        
        // Create new player item
        playerItem = AVPlayerItem(url: url)
        
        // Create or reuse player
        if player == nil {
            player = AVPlayer(playerItem: playerItem)
        } else {
            player?.replaceCurrentItem(with: playerItem)
        }
        
        // Set volume
        if let volume = call.getFloat("volume") {
            player?.volume = volume
        }
        
        // Set playback rate
        if let rate = call.getFloat("playbackRate") {
            player?.rate = rate
        }
        
        // Seek to start position
        if let startPosition = call.getDouble("startPosition") {
            player?.seek(to: CMTime(seconds: startPosition, preferredTimescale: 1000))
        }
        
        // Setup time observer
        setupTimeObserver()
        
        // Setup end observer
        setupEndObserver()
        
        // Update metadata
        if let metadata = call.getObject("metadata") {
            updateNowPlayingInfo(metadata: metadata)
        }
        
        // Start playback
        player?.play()
        
        notifyListeners("playbackStateChange", data: [
            "state": "playing",
            "isLoading": false
        ])
        
        call.resolve()
    }
    
    @objc func pause(_ call: CAPPluginCall) {
        player?.pause()
        notifyListeners("playbackStateChange", data: ["state": "paused"])
        call.resolve()
    }
    
    @objc func resume(_ call: CAPPluginCall) {
        player?.play()
        notifyListeners("playbackStateChange", data: ["state": "playing"])
        call.resolve()
    }
    
    @objc func stop(_ call: CAPPluginCall) {
        player?.pause()
        player?.seek(to: .zero)
        notifyListeners("playbackStateChange", data: ["state": "stopped"])
        call.resolve()
    }
    
    @objc func seek(_ call: CAPPluginCall) {
        guard let position = call.getDouble("position") else {
            call.reject("Position required")
            return
        }
        
        let time = CMTime(seconds: position, preferredTimescale: 1000)
        player?.seek(to: time) { [weak self] _ in
            self?.notifyListeners("positionUpdate", data: ["position": position])
        }
        
        call.resolve()
    }
    
    @objc func setVolume(_ call: CAPPluginCall) {
        guard let volume = call.getFloat("volume") else {
            call.reject("Volume required")
            return
        }
        
        player?.volume = max(0, min(1, volume))
        call.resolve()
    }
    
    @objc func setPlaybackRate(_ call: CAPPluginCall) {
        guard let rate = call.getFloat("rate") else {
            call.reject("Rate required")
            return
        }
        
        player?.rate = max(0.5, min(2.0, rate))
        call.resolve()
    }
    
    @objc func getState(_ call: CAPPluginCall) {
        let state: String
        switch player?.timeControlStatus {
        case .playing:
            state = "playing"
        case .paused:
            state = "paused"
        case .waitingToPlayAtSpecifiedRate:
            state = "loading"
        default:
            state = "idle"
        }
        
        let position = player?.currentTime().seconds ?? 0
        let duration = playerItem?.duration.seconds ?? 0
        let buffered = calculateBufferedAmount()
        
        call.resolve([
            "state": state,
            "position": position.isNaN ? 0 : position,
            "duration": duration.isNaN ? 0 : duration,
            "buffered": buffered,
            "isLoading": player?.timeControlStatus == .waitingToPlayAtSpecifiedRate
        ])
    }
    
    @objc func prefetch(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
              let url = URL(string: urlString) else {
            call.reject("Invalid URL")
            return
        }
        
        // Create prefetch player
        let item = AVPlayerItem(url: url)
        prefetchPlayer = AVPlayer(playerItem: item)
        prefetchPlayer?.pause()
        
        call.resolve()
    }
    
    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": true])
    }
    
    // MARK: - Private Methods
    
    private func setupTimeObserver() {
        // Remove existing observer
        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
        }
        
        // Add new observer (every 250ms)
        let interval = CMTime(seconds: 0.25, preferredTimescale: 1000)
        timeObserver = player?.addPeriodicTimeObserver(
            forInterval: interval,
            queue: .main
        ) { [weak self] time in
            let position = time.seconds
            let buffered = self?.calculateBufferedAmount() ?? 0
            
            self?.notifyListeners("positionUpdate", data: [
                "position": position.isNaN ? 0 : position,
                "buffered": buffered
            ])
            
            // Update now playing info
            self?.updatePlaybackPosition(position: position)
        }
    }
    
    private func setupEndObserver() {
        NotificationCenter.default.removeObserver(
            self,
            name: .AVPlayerItemDidPlayToEndTime,
            object: nil
        )
        
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(playerDidFinishPlaying),
            name: .AVPlayerItemDidPlayToEndTime,
            object: playerItem
        )
    }
    
    @objc private func playerDidFinishPlaying() {
        notifyListeners("trackEnd", data: [:])
    }
    
    private func calculateBufferedAmount() -> Double {
        guard let item = playerItem,
              let timeRange = item.loadedTimeRanges.first?.timeRangeValue else {
            return 0
        }
        
        let duration = item.duration.seconds
        if duration.isNaN || duration == 0 {
            return 0
        }
        
        let bufferedEnd = timeRange.start.seconds + timeRange.duration.seconds
        return bufferedEnd / duration
    }
    
    private func setupRemoteCommandCenter() {
        let commandCenter = MPRemoteCommandCenter.shared()
        
        commandCenter.playCommand.addTarget { [weak self] _ in
            self?.player?.play()
            return .success
        }
        
        commandCenter.pauseCommand.addTarget { [weak self] _ in
            self?.player?.pause()
            return .success
        }
        
        commandCenter.nextTrackCommand.addTarget { [weak self] _ in
            self?.notifyListeners("trackEnd", data: [:])
            return .success
        }
        
        commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }
            let time = CMTime(seconds: event.positionTime, preferredTimescale: 1000)
            self?.player?.seek(to: time)
            return .success
        }
    }
    
    private func setupNowPlayingInfo() {
        var info = [String: Any]()
        info[MPMediaItemPropertyTitle] = "Focus Music"
        info[MPMediaItemPropertyArtist] = "Loading..."
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
    
    private func updateNowPlayingInfo(metadata: [String: Any]) {
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [String: Any]()
        
        if let title = metadata["title"] as? String {
            info[MPMediaItemPropertyTitle] = title
        }
        if let artist = metadata["artist"] as? String {
            info[MPMediaItemPropertyArtist] = artist
        }
        if let album = metadata["album"] as? String {
            info[MPMediaItemPropertyAlbumTitle] = album
        }
        if let duration = metadata["duration"] as? Double {
            info[MPMediaItemPropertyPlaybackDuration] = duration
        }
        
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
    
    private func updatePlaybackPosition(position: Double) {
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [String: Any]()
        info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = position
        info[MPNowPlayingInfoPropertyPlaybackRate] = player?.rate ?? 1.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
```

### 2. Register the Plugin

Create `ios/App/App/NativeAudioPlugin.m`:

```objc
#import <Capacitor/Capacitor.h>

CAP_PLUGIN(NativeAudioPlugin, "NativeAudio",
    CAP_PLUGIN_METHOD(play, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(pause, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(resume, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(stop, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(seek, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setVolume, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(setPlaybackRate, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(getState, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(prefetch, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
)
```

### 3. Update Info.plist

Add background audio capability to `ios/App/App/Info.plist`:

```xml
<key>UIBackgroundModes</key>
<array>
    <string>audio</string>
</array>
```

## Usage

The plugin will be automatically detected when running in a native iOS app. The web fallback will be used in development/browser mode.

```typescript
import { getNativeAudioBridge } from './lib/nativeAudioBridge';

const bridge = getNativeAudioBridge();

// Check if native audio is available
if (bridge.isNative()) {
  console.log('Using native AVPlayer');
} else {
  console.log('Using web audio fallback');
}

// Play audio
await bridge.play({
  url: 'https://example.com/audio.mp3',
  metadata: {
    title: 'Track Name',
    artist: 'Artist Name',
    duration: 180,
  },
});
```

## Benefits of Native Audio

1. **True Background Playback**: Audio continues when app is backgrounded
2. **Lock Screen Controls**: Full integration with iOS lock screen
3. **No WebKit Buffer Limits**: AVPlayer handles buffering internally
4. **Better Battery Life**: Native code is more efficient
5. **AirPlay Support**: Built-in support for AirPlay and Bluetooth
