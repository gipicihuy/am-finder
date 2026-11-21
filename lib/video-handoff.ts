export type VideoHandoff = {
  time: number;
  muted: boolean;
  at: number;
};

export const VIDEO_HANDOFF_DONE = "amf:video-handoff-done";

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
