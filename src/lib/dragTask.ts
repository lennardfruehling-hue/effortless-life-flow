// Lightweight cross-component drag state so tasks can be dropped on the daily
// calendar with a mouse (HTML5 DnD) or with a finger (touch fallback).

let currentTaskId: string | null = null;

export function setDragTaskId(id: string | null) {
  currentTaskId = id;
}

export function getDragTaskId() {
  return currentTaskId;
}

export const TOUCH_DROP_EVENT = "serpent-task-touch-drop";

export interface TouchDropDetail {
  taskId: string;
  clientX: number;
  clientY: number;
}

/**
 * Attach touch handlers to a task element so it can be dragged onto the
 * calendar on touch devices. Returns props to spread onto the element.
 */
export function touchDragProps(taskId: string) {
  let active = false;
  let startX = 0;
  let startY = 0;
  return {
    onTouchStart: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
      active = false;
    },
    onTouchMove: (e: React.TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      const dx = Math.abs(t.clientX - startX);
      const dy = Math.abs(t.clientY - startY);
      if (!active && dx > 12 && dx > dy) {
        active = true;
        setDragTaskId(taskId);
      }
    },
    onTouchEnd: (e: React.TouchEvent) => {
      if (!active) return;
      active = false;
      const t = e.changedTouches[0];
      setDragTaskId(null);
      if (!t) return;
      window.dispatchEvent(
        new CustomEvent<TouchDropDetail>(TOUCH_DROP_EVENT, {
          detail: { taskId, clientX: t.clientX, clientY: t.clientY },
        })
      );
    },
  };
}
