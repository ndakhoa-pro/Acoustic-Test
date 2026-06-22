import { useEffect, useRef } from "react";

interface WaveformVisualizerProps {
  stream: MediaStream | null;
  mode: "idle" | "listening" | "sine" | "off";
  color?: string;
}

export default function WaveformVisualizer({ stream, mode, color = "#06b6d4" }: WaveformVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  useEffect(() => {
    // If we are listening and have a stream, build the AudioAnalyser
    if (mode === "listening" && stream) {
      try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioCtx();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        audioContextRef.current = audioCtx;
        analyserRef.current = analyser;
        sourceRef.current = source;

        const bufferLength = analyser.frequencyBinCount;
        dataArrayRef.current = new Uint8Array(bufferLength);
      } catch (err) {
        console.error("Failed to initialize Web Audio analyser:", err);
      }
    }

    // Cleanup when mode or stream changes
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (sourceRef.current) {
        sourceRef.current.disconnect();
        sourceRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
      }
      audioContextRef.current = null;
      analyserRef.current = null;
      dataArrayRef.current = null;
    };
  }, [mode, stream]);

  // Handle high performance Canvas rendering loops
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set pixel density correctly for retina screens
    const resizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * window.devicePixelRatio;
      canvas.height = rect.height * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resizeCanvas();

    let simPhase = 0;

    const draw = () => {
      if (!canvasRef.current) return;
      
      const width = canvas.width / window.devicePixelRatio;
      const height = canvas.height / window.devicePixelRatio;

      // Clean background
      ctx.clearRect(0, 0, width, height);

      if (mode === "off") {
        return;
      }

      if (mode === "listening" && analyserRef.current && dataArrayRef.current) {
        // Draw real microphone data
        const analyser = analyserRef.current;
        const dataArray = dataArrayRef.current;
        analyser.getByteTimeDomainData(dataArray);

        // Draw multiple glowing layers
        ctx.shadowBlur = 12;
        ctx.shadowColor = color;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = "round";
        ctx.beginPath();

        const sliceWidth = width / dataArray.length;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
          const v = dataArray[i] / 128.0; // Normalized between 0 and 2
          const y = (v * height) / 2;

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }

          x += sliceWidth;
        }

        ctx.lineTo(width, height / 2);
        ctx.stroke();

        // Draw subline for tech aesthetic
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        x = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = dataArray[i] / 128.0;
          const y = (v * height) / 2 + 1; // offset by 1
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
          x += sliceWidth;
        }
        ctx.stroke();

      } else if (mode === "sine" || mode === "idle" || mode === "listening") {
        // Draw simulated elegant sound waves (when no active stream coordinates)
        simPhase += 0.05;
        const waveCount = mode === "sine" ? 3 : 1;

        for (let w = 0; w < waveCount; w++) {
          ctx.beginPath();
          ctx.shadowBlur = mode === "sine" ? 8 : 4;
          ctx.shadowColor = color;
          
          const opacity = mode === "sine" ? (1 - w * 0.25) : 0.4;
          ctx.strokeStyle = w === 0 ? color : `rgba(${hexToRgb(color)}, ${opacity})`;
          ctx.lineWidth = w === 0 ? 2.5 : 1.2;

          const amplitude = mode === "sine" 
            ? (height / 3.5) * (1 - w * 0.2) 
            : (height / 8); // subtle wobble for idle

          const frequency = mode === "sine" 
            ? (0.015 + w * 0.005) 
            : 0.01;

          for (let x = 0; x <= width; x += 3) {
            // Apply a windowing envelope so the wave dies out on left and right edges
            const envelope = Math.sin((x / width) * Math.PI);
            const y = (height / 2) + Math.sin(x * frequency + simPhase + w * Math.PI/4) * amplitude * envelope;

            if (x === 0) {
              ctx.moveTo(x, y);
            } else {
              ctx.lineTo(x, y);
            }
          }
          ctx.stroke();
        }
      }

      animationRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [mode, color]);

  // Helper to convert simple hex values to rgb for rgba strings
  const hexToRgb = (hex: string) => {
    const cleaned = hex.replace("#", "");
    const r = parseInt(cleaned.substring(0, 2), 16);
    const g = parseInt(cleaned.substring(2, 4), 16);
    const b = parseInt(cleaned.substring(4, 6), 16);
    return `${r}, ${g}, ${b}`;
  };

  return (
    <div id="visualizer-container" className="w-full h-24 relative overflow-hidden bg-zinc-950/40 rounded-xl border border-zinc-800/60 p-1">
      <canvas
        id="waveform-canvas"
        ref={canvasRef}
        className="w-full h-full block"
      />
      
      {/* Decorative grids for tech/editorial vibe */}
      <div className="absolute inset-0 pointer-events-none flex justify-between px-6 opacity-10">
        <div className="w-[1px] h-full bg-white border-dashed border-r" />
        <div className="w-[1px] h-full bg-white border-dashed border-r" />
        <div className="w-[1px] h-full bg-white border-dashed border-r" />
        <div className="w-[1px] h-full bg-white border-dashed border-r" />
      </div>
      <div className="absolute inset-0 pointer-events-none flex flex-col justify-between py-4 opacity-10">
        <div className="h-[1px] w-full bg-white border-dashed border-b" />
        <div className="h-[1px] w-full bg-white border-dashed border-b" />
      </div>
    </div>
  );
}
