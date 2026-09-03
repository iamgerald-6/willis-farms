"use client";

import { useEffect, useRef, useState } from "react";
import { PenLine, Type, Eraser } from "lucide-react";

type Props = {
  mode: "typed" | "drawn";
  onModeChange: (mode: "typed" | "drawn") => void;
  typedValue: string;
  onTypedChange: (value: string) => void;
  /** Drawn signature as a PNG data URL, or null if nothing drawn yet. */
  drawnValue: string | null;
  onDrawnChange: (dataUrl: string | null) => void;
};

/** Lets HR type their name or draw a signature (mouse or touch) before saving the offer letter. */
export default function SignaturePad({
  mode,
  onModeChange,
  typedValue,
  onTypedChange,
  drawnValue,
  onDrawnChange,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [hasStroke, setHasStroke] = useState(false);

  // Re-render any previously saved drawing when switching back to drawn mode.
  useEffect(() => {
    if (mode !== "drawn") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (drawnValue) {
      const img = new Image();
      img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      img.src = drawnValue;
      setHasStroke(true);
    } else {
      setHasStroke(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-init on mode switch
  }, [mode]);

  const getPoint = (
    canvas: HTMLCanvasElement,
    e: React.MouseEvent | React.TouchEvent,
  ): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    const point = "touches" in e ? e.touches[0] : e;
    return {
      x: ((point.clientX - rect.left) / rect.width) * canvas.width,
      y: ((point.clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    drawingRef.current = true;
    const { x, y } = getPoint(canvas, e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPoint(canvas, e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111827";
    ctx.lineTo(x, y);
    ctx.stroke();
    setHasStroke(true);
  };

  const endDraw = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    onDrawnChange(canvas.toDataURL("image/png"));
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasStroke(false);
    onDrawnChange(null);
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <button
          type="button"
          onClick={() => onModeChange("typed")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
            mode === "typed"
              ? "bg-red-600 text-white border-red-600"
              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
          }`}
        >
          <Type className="w-3.5 h-3.5" />
          Type name
        </button>
        <button
          type="button"
          onClick={() => onModeChange("drawn")}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border ${
            mode === "drawn"
              ? "bg-red-600 text-white border-red-600"
              : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
          }`}
        >
          <PenLine className="w-3.5 h-3.5" />
          Draw signature
        </button>
      </div>

      {mode === "typed" ? (
        <input
          type="text"
          value={typedValue}
          onChange={(e) => onTypedChange(e.target.value)}
          placeholder="Type your full name"
          className="w-full rounded-xl border border-gray-200 px-4 py-3 text-lg italic text-gray-800 focus:outline-none focus:ring-2 focus:ring-red-200"
          style={{ fontFamily: "cursive" }}
        />
      ) : (
        <div>
          <canvas
            ref={canvasRef}
            width={500}
            height={160}
            className="w-full h-40 rounded-xl border border-dashed border-gray-300 bg-white touch-none"
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          />
          <div className="flex items-center justify-between mt-1.5">
            <p className="text-xs text-gray-400">Draw with mouse or touch</p>
            {hasStroke && (
              <button
                type="button"
                onClick={clearCanvas}
                className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-red-600"
              >
                <Eraser className="w-3.5 h-3.5" />
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
