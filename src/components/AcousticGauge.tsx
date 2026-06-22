import { useEffect, useState } from "react";

interface AcousticGaugeProps {
  score: number;
}

export default function AcousticGauge({ score }: AcousticGaugeProps) {
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    // Elegant number roll animation
    let start = 0;
    const duration = 1200; // ms
    const increment = Math.ceil(score / (duration / 16));
    
    const timer = setInterval(() => {
      start += increment;
      if (start >= score) {
        setAnimatedScore(score);
        clearInterval(timer);
      } else {
        setAnimatedScore(start);
      }
    }, 16);

    return () => clearInterval(timer);
  }, [score]);

  // Determine standard feedback levels
  const getEvaluation = (val: number) => {
    if (val >= 85) return { text: "Optimized & Balanced", color: "text-zinc-200" };
    if (val >= 70) return { text: "Good Sounding", color: "text-zinc-300" };
    if (val >= 50) return { text: "Moderately Reflective", color: "text-zinc-400" };
    return { text: "Highly Reflective", color: "text-zinc-500" };
  };

  const evalState = getEvaluation(score);

  return (
    <div id="acoustic-gauge-widget" className="flex flex-col items-start justify-between p-8 border border-white/10 bg-[#0F0F0F]/60 backdrop-blur-md rounded-2xl relative overflow-hidden h-full">
      {/* Editorial Watermark background */}
      <span className="absolute right-6 top-6 font-mono text-[9px] text-white/30 select-none uppercase tracking-[0.3em] leading-none">
        RF-T80 Diagnostics
      </span>

      <div className="w-full">
        <p className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-4">Overall Performance</p>
        <div className="text-[130px] sm:text-[160px] md:text-[180px] font-serif font-light leading-[0.8] tracking-tighter flex items-baseline text-white">
          {animatedScore}
          <span className="text-2xl sm:text-3xl font-sans font-normal opacity-30 ml-2">/100</span>
        </div>
        
        <div className="mt-8 flex items-center space-x-3">
          <div className="h-[1px] w-12 bg-white/40"></div>
          <p className="text-sm italic font-serif text-white/80">"{evalState.text} Environment"</p>
        </div>
      </div>

      <div className="mt-8 pt-4 border-t border-white/5 w-full flex justify-between items-center text-[10px] uppercase tracking-widest text-white/40 font-mono">
        <span>Signal Quality Index</span>
        <span className="text-white">{score >= 70 ? "CLASS A" : "CLASS B"}</span>
      </div>
    </div>
  );
}

