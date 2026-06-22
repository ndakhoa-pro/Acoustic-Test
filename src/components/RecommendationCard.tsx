import { Recommendation } from "../types";
import { MoveRight } from "lucide-react";

interface RecommendationCardProps {
  recommendation: Recommendation;
  index: number;
  key?: any;
}

export default function RecommendationCard({ recommendation, index }: RecommendationCardProps) {
  const getPriorityStyle = (priority: string) => {
    switch (priority.toLowerCase()) {
      case "high":
        return "bg-rose-500/10 text-rose-200 border-rose-500/20";
      case "medium":
        return "bg-amber-400/10 text-amber-200 border-amber-400/25";
      default:
        return "bg-white/5 text-white/60 border-white/10";
    }
  };

  return (
    <div 
      id={`rec-card-${index}`}
      className="border border-white/10 p-5 rounded-xl flex items-start space-x-4 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-300"
    >
      <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-[10px] font-mono shrink-0 text-white/70">
        0{index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
          <span className="text-[9px] uppercase tracking-[0.15em] font-mono text-white/40">
            {recommendation.category}
          </span>
          <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[8px] uppercase tracking-wider font-mono border ${getPriorityStyle(recommendation.priority)}`}>
            {recommendation.priority} Priority
          </span>
        </div>
        
        <h3 className="text-sm font-semibold mb-1 text-white tracking-tight uppercase">
          {recommendation.title}
        </h3>
        
        <p className="text-xs text-white/60 leading-relaxed font-sans mb-3">
          {recommendation.detail}
        </p>

        <div className="flex items-center gap-1.5 text-[10px] font-mono text-white/40 border-t border-white/5 pt-2">
          <span className="text-white/60">Impact:</span>
          <span className="truncate text-white/50">{recommendation.impact}</span>
        </div>
      </div>
    </div>
  );
}

