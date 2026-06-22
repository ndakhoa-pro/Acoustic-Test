export interface AcousticMetric {
  reverbTimeMs: number;
  echoDensityPercentage: number;
  noiseFloorDb: number;
  absorptionRating: number;
  bassTamingRating: number;
}

export interface Recommendation {
  title: string;
  category: string;
  detail: string;
  impact: string;
  priority: 'High' | 'Medium' | 'Low' | string;
}

export interface AcousticReport {
  acousticProfile: 'Bright/Echoey' | 'Muddy/Boomy' | 'Damped/Dead' | string;
  acousticScore: number;
  metrics: AcousticMetric;
  summaryText: string;
  recommendations: Recommendation[];
  isSimulated?: boolean;
  warning?: string;
}

export type AppState = 'idle' | 'countdown' | 'recording' | 'analyzing' | 'success' | 'error';
