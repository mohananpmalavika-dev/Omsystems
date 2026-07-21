"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

export function HlsPlayer({
  url,
  bearerToken,
  cameraName,
  onPlaybackError,
}: {
  url: string;
  bearerToken: string;
  cameraName: string;
  onPlaybackError?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const playbackErrorRef = useRef(onPlaybackError);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    playbackErrorRef.current = onPlaybackError;
  }, [onPlaybackError]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setFailed(false);
    if (!Hls.isSupported()) {
      setFailed(true);
      return;
    }
    let fatalRetries = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const hls = new Hls({
      lowLatencyMode: true,
      backBufferLength: 30,
      xhrSetup: (xhr, requestUrl) => {
        // MediaMTX forwards this short-lived, path-bound value to the media
        // gateway for every playlist and segment request. Opening the request
        // here makes sure derived HLS resources receive the token as well.
        const authorizedUrl = new URL(requestUrl);
        authorizedUrl.searchParams.set("token", bearerToken);
        xhr.withCredentials = true;
        xhr.open("GET", authorizedUrl.toString(), true);
      },
    });
    hls.loadSource(url);
    hls.attachMedia(video);
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      fatalRetries = 0;
      void video.play().catch(() => undefined);
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return;
      if (fatalRetries < 2) {
        fatalRetries += 1;
        retryTimer = setTimeout(() => {
          if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            hls.recoverMediaError();
          } else {
            hls.startLoad();
          }
        }, fatalRetries * 1_000);
        return;
      }
      setFailed(true);
      playbackErrorRef.current?.();
    });
    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      hls.destroy();
    };
  }, [bearerToken, url]);

  if (failed) {
    return (
      <div className="feed-error">
        Stream could not start. Check camera codec and connectivity.
      </div>
    );
  }
  return (
    <video
      ref={videoRef}
      className="live-video"
      aria-label={`Live video from ${cameraName}`}
      muted
      playsInline
      autoPlay
    />
  );
}
