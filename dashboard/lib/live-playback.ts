// Relay and tunnel URLs can carry HLS video. Only explicit image endpoints
// should use the snapshot renderer; query strings and hostnames are irrelevant.
export function isSnapshotSource(value: string): boolean {
  if (!value) return false;
  try {
    const { pathname } = new URL(value, "http://localhost");
    return /\.(jpe?g|png|webp)$/i.test(pathname) ||
      /\/(snapshot|snapshot-relay)(\/|$)/i.test(pathname);
  } catch {
    return false;
  }
}

export async function playLiveVideo(
  video: HTMLVideoElement,
  isCurrent: () => boolean,
  onAutoplayMuted: () => void,
): Promise<void> {
  try {
    await video.play();
  } catch (error) {
    if (!isCurrent() || !(error instanceof DOMException) || error.name !== "NotAllowedError") return;
    // Browsers block autoplay with sound until an operator interacts. Keep
    // the camera video running and let the operator explicitly enable audio.
    video.muted = true;
    onAutoplayMuted();
    await video.play().catch(() => undefined);
  }
}
