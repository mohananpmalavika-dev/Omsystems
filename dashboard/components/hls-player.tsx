"use client";

import Hls from "hls.js";
import { useEffect, useRef, useState } from "react";

export function HlsPlayer({
  url,
  bearerToken,
  cameraName,
}: {
  url: string;
  bearerToken: string;
  cameraName: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!Hls.isSupported()) {
      setFailed(true);
      return;
    }
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
      void video.play().catch(() => undefined);
    });
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (data.fatal) setFailed(true);
    });
    return () => hls.destroy();
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
