type FrameId = number;

type DragFrameSchedulerOptions = {
  requestFrame?: (callback: () => void) => FrameId;
  cancelFrame?: (frameId: FrameId) => void;
};

export type DragFrameScheduler<T> = {
  schedule: (value: T) => void;
  flush: () => void;
  cancel: () => void;
};

const defaultRequestFrame = (callback: () => void) =>
  window.requestAnimationFrame(callback);

const defaultCancelFrame = (frameId: FrameId) =>
  window.cancelAnimationFrame(frameId);

export function createDragFrameScheduler<T>(
  deliver: (value: T) => void,
  options: DragFrameSchedulerOptions = {},
): DragFrameScheduler<T> {
  const requestFrame = options.requestFrame ?? defaultRequestFrame;
  const cancelFrame = options.cancelFrame ?? defaultCancelFrame;
  let pendingValue: T | null = null;
  let frameId: FrameId | null = null;

  const clearFrame = () => {
    if (frameId === null) return;
    cancelFrame(frameId);
    frameId = null;
  };

  const deliverPending = () => {
    frameId = null;
    if (pendingValue === null) return;
    const value = pendingValue;
    pendingValue = null;
    deliver(value);
  };

  return {
    schedule(value: T) {
      pendingValue = value;
      if (frameId !== null) return;
      frameId = requestFrame(deliverPending);
    },
    flush() {
      clearFrame();
      if (pendingValue === null) return;
      const value = pendingValue;
      pendingValue = null;
      deliver(value);
    },
    cancel() {
      clearFrame();
      pendingValue = null;
    },
  };
}
