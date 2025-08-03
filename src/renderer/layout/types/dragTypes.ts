export interface DragState {
  isDragging: boolean;
  dragData: any;
  startPosition: { x: number; y: number };
  currentPosition: { x: number; y: number };
  sourceType: 'sidebar' | 'monitor' | 'minimized' | null;
  sourceId: string | null;
  dragPreview: React.ReactNode | null;
}

export type DragSourceType = 'sidebar' | 'monitor' | 'minimized';