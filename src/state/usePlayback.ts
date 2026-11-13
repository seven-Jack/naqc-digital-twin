import { useCallback, useEffect, useRef, useState } from 'react';

export function usePlayback(duration: number) {
  const [time, setTime] = useState(0);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(1);
  const currentTime = useRef(0);
  const updateTime = useCallback((seconds: number) => {
    currentTime.current = seconds;
    setTime(seconds);
  }, []);
  const reset = useCallback(() => {
    setRunning(false);
    updateTime(0);
  }, [updateTime]);

  useEffect(() => {
    if (!running) return;
    let previous = performance.now();
    let frame: number;
    function tick(now: number) {
      const increment = Math.max(0, Math.min(60, now - previous)) * duration * speed / 4800;
      previous = now;
      const time = Math.min(duration, currentTime.current + increment);
      updateTime(time);
      if (time >= duration) setRunning(false);
      else frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [duration, running, speed, updateTime]);

  const seek = useCallback((seconds: number) => {
    setRunning(false);
    updateTime(Math.min(duration, Math.max(0, seconds)));
  }, [duration, updateTime]);

  return {
    time, running, speed, setSpeed, reset, seek,
    toggle: () => {
      if (!running && currentTime.current >= duration) updateTime(0);
      setRunning(!running);
    },
  };
}
