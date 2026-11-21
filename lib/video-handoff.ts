export type VideoHandoff = {
  time: number;
  muted: boolean;
  at: number;
};

export const VIDEO_HANDOFF_DONE = "amf:video-handoff-done";
export const VIDEO_HANDOFF_ZOOM = "amf:video-handoff-zoom";

export type VideoZoom = {
  dx: number;
  dy: number;
  scale: number;
  duration: number;
  easing: string;
};

export function emitVideoZoom(zoom: VideoZoom): void {
  window.dispatchEvent(new CustomEvent<VideoZoom>(VIDEO_HANDOFF_ZOOM, { detail: zoom }));
}

let pending: VideoHandoff | null = null;

export function setVideoHandoff(handoff: VideoHandoff): void {
  pending = handoff;
}

export function peekVideoHandoff(): VideoHandoff | null {
  if (!pending) return null;
  if (performance.now() - pending.at > 5000) {
    pending = null;
    return null;
  }
  return pending;
}

export function finishVideoHandoff(): void {
  if (!pending) return;
  pending = null;
  window.dispatchEvent(new Event(VIDEO_HANDOFF_DONE));
}

export function clearVideoHandoff(): void {
  pending = null;
}
