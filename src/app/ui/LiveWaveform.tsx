import { useEffect, useRef } from "react";
import type { LiveLevelStream } from "../../features/recording/liveLevelStream.js";
import { createWaveformScroller } from "../../features/recording/waveformScroller.js";
import type { WaveformPalette } from "./waveformPainter.js";
import { columnsForWidth, paintWaveform } from "./waveformPainter.js";

/**
 * Draws the live input on a canvas rather than as animated DOM nodes: the
 * native capture helper reports amplitude every 40ms per track, and only a
 * per-frame redraw of the whole column history reads as a real waveform.
 */
export function LiveWaveform({ paused, stream }: { paused: boolean; stream: LiveLevelStream }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pausedRef = useRef(paused);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    const element = canvasRef.current;
    const elementContext = element?.getContext("2d");
    if (!element || !elementContext) {
      return;
    }

    const canvas = element;
    const context = elementContext;

    const scroller = createWaveformScroller({ columns: columnsForWidth(canvas.clientWidth) });
    const palette = readPalette(canvas);
    let cssWidth = 0;
    let cssHeight = 0;
    let ratio = 0;
    let lastFrameMs = performance.now();
    let frame = 0;

    function syncCanvasSize(): void {
      const nextRatio = window.devicePixelRatio || 1;
      const nextWidth = canvas.clientWidth;
      const nextHeight = canvas.clientHeight;
      if (nextWidth === cssWidth && nextHeight === cssHeight && nextRatio === ratio) {
        return;
      }

      cssWidth = nextWidth;
      cssHeight = nextHeight;
      ratio = nextRatio;
      canvas.width = Math.max(1, Math.round(cssWidth * ratio));
      canvas.height = Math.max(1, Math.round(cssHeight * ratio));
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      scroller.resize(columnsForWidth(cssWidth));
    }

    function draw(nowMs: number): void {
      frame = window.requestAnimationFrame(draw);
      const elapsedMs = Math.min(nowMs - lastFrameMs, 250);
      lastFrameMs = nowMs;
      syncCanvasSize();

      if (pausedRef.current) {
        scroller.idle(elapsedMs);
      } else {
        scroller.advance(elapsedMs, stream.read());
      }

      paintWaveform(context, scroller.values, {
        width: cssWidth,
        height: cssHeight,
        paused: pausedRef.current,
        palette
      });
    }

    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [stream]);

  return (
    <div className={`live-waveform ${paused ? "paused" : ""}`}>
      <canvas aria-label="实时音频波形" ref={canvasRef} role="img" />
    </div>
  );
}

function readPalette(element: HTMLElement): WaveformPalette {
  const styles = getComputedStyle(element);
  const read = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;
  return {
    accent: read("--accent", "#b9533f"),
    accentStrong: read("--accent-dark", "#93412f"),
    line: read("--line", "#d9d5cc")
  };
}
