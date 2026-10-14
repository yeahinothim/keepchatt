import React, { useRef, useCallback } from 'react';

export interface LongPressCoords {
  clientX: number;
  clientY: number;
  target?: EventTarget | null;
}

export interface UseLongPressOptions {
  delay?: number;
  onLongPress: (coords: LongPressCoords) => void;
  onClick?: (e: React.MouseEvent) => void;
}

export function useLongPress({ delay = 420, onLongPress, onClick }: UseLongPressOptions) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const firedRef = useRef<boolean>(false);

  const start = useCallback(
    (e: React.TouchEvent | React.MouseEvent | React.PointerEvent) => {
      // Don't trigger long press on right click
      if ('button' in e && e.button !== 0) return;

      firedRef.current = false;
      const clientX = 'touches' in e && e.touches[0] ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e && e.touches[0] ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      startPosRef.current = { x: clientX, y: clientY };

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        firedRef.current = true;
        try {
          if ('vibrate' in navigator) {
            navigator.vibrate(40);
          }
        } catch {
          // Ignore
        }
        onLongPress({ clientX, clientY, target: e.target });
      }, delay);
    },
    [delay, onLongPress]
  );

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const move = useCallback(
    (e: React.TouchEvent | React.MouseEvent | React.PointerEvent) => {
      if (!startPosRef.current) return;
      const clientX = 'touches' in e && e.touches[0] ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
      const clientY = 'touches' in e && e.touches[0] ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
      const dist = Math.hypot(clientX - startPosRef.current.x, clientY - startPosRef.current.y);
      if (dist > 8) {
        clear();
      }
    },
    [clear]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (firedRef.current) {
        e.preventDefault();
        e.stopPropagation();
        firedRef.current = false;
        return;
      }
      onClick?.(e);
    },
    [onClick]
  );

  return {
    onPointerDown: start,
    onPointerUp: clear,
    onPointerMove: move,
    onPointerCancel: clear,
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchMove: move,
    onTouchCancel: clear,
    onClick: handleClick,
    hasFired: () => firedRef.current,
  };
}
