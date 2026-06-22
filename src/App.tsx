import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Volume2, 
  Mic, 
  RefreshCw, 
  Sliders, 
  AlertCircle, 
  CheckCircle2, 
  HelpCircle, 
  ArrowRight,
  Sparkles,
  Info,
  Compass,
  FileSpreadsheet,
  Gauge,
  Activity,
  History
} from "lucide-react";

import { AcousticReport, AppState } from "./types";
import WaveformVisualizer from "./components/WaveformVisualizer";
import AcousticGauge from "./components/AcousticGauge";
import RecommendationCard from "./components/RecommendationCard";

const ROOM_PRESETS = [
  { label: "Home Office", value: "Home office for virtual meetings and clean vocal isolation" },
  { label: "Music Room", value: "Dedicated music listening, Hi-Fi stereo staging, and production" },
  { label: "Bedroom", value: "Bedroom space focusing on heavy soft materials and quiet sleep taming" },
  { label: "Podcast Studio", value: "Dry, close-talk podcast and vocal recording with zero background hum" },
];

export default function App() {
  const [appState, setAppState] = useState<AppState>("idle");
  const [roomUseText, setRoomUseText] = useState("Home office for virtual meetings");
  const [countdown, setCountdown] = useState(3);
  const [recordingProgress, setRecordingProgress] = useState(0);
  const [recordingStream, setRecordingStream] = useState<MediaStream | null>(null);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(null);
  const [acousticReport, setAcousticReport] = useState<AcousticReport | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [historyReports, setHistoryReports] = useState<AcousticReport[]>([]);

  // Load history from localStorage if any
  useEffect(() => {
    try {
      const stored = localStorage.getItem("acoustic_history");
      if (stored) {
        setHistoryReports(JSON.parse(stored));
      }
    } catch (e) {
      console.warn("Could not read report history:", e);
    }
  }, []);

  // Countdown timer logic
  useEffect(() => {
    if (appState === "countdown") {
      if (countdown > 0) {
        const timer = setTimeout(() => {
          setCountdown(countdown - 1);
        }, 1000);
        return () => clearTimeout(timer);
      } else {
        startRecordedAudioCapture();
      }
    }
  }, [appState, countdown]);

  // Actual recording timeline logic (5 seconds)
  useEffect(() => {
    if (appState === "recording") {
      const totalDuration = 5000; // 5000ms
      const step = 100; // update scale
      const increment = (step / totalDuration) * 100;

      const timer = setInterval(() => {
        setRecordingProgress((prev) => {
          if (prev >= 100) {
            clearInterval(timer);
            if (mediaRecorder && mediaRecorder.state === "recording") {
              mediaRecorder.stop();
            }
            return 100;
          }
          return prev + increment;
        });
      }, step);

      return () => clearInterval(timer);
    }
  }, [appState, mediaRecorder]);

  // Request Mic & Initiate Countdown
  const handleInitiateScan = async () => {
    setErrorMsg(null);
    setAppState("countdown");
    setCountdown(3);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setRecordingStream(stream);
    } catch (err: any) {
      console.error("Mic Permission Refused:", err);
      // Give clear descriptive support feedback
      setErrorMsg("Unable to access your phone's microphone. Please verify that this site has permission to use the microphone in your browser's security settings.");
      setAppState("error");
    }
  };

  // Start the actual mic capture
  const startRecordedAudioCapture = () => {
    if (!recordingStream) {
      setAppState("error");
      setErrorMsg("Lost reference to microphone capture stream. Let's try again.");
      return;
    }

    setAppState("recording");
    setRecordingProgress(0);

    // Pick optimal/supported browser audio format
    let mimeTypeSpec = "audio/webm";
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported) {
      if (MediaRecorder.isTypeSupported("audio/webm")) mimeTypeSpec = "audio/webm";
      else if (MediaRecorder.isTypeSupported("audio/mp4")) mimeTypeSpec = "audio/mp4";
      else if (MediaRecorder.isTypeSupported("audio/aac")) mimeTypeSpec = "audio/aac";
      else if (MediaRecorder.isTypeSupported("audio/ogg")) mimeTypeSpec = "audio/ogg";
    }

    try {
      const recorder = new MediaRecorder(recordingStream, {
        mimeType: mimeTypeSpec,
      });

      const audioChunks: Blob[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        // Halt physical mic active state immediately
        if (recordingStream) {
          recordingStream.getTracks().forEach((track) => track.stop());
        }
        setRecordingStream(null);

        const compiledAudioBlob = new Blob(audioChunks, { type: mimeTypeSpec });

        // Alert user if file completely corrupt or short
        if (compiledAudioBlob.size < 400) {
          setAppState("error");
          setErrorMsg("Mic captured zero amplitude. Please make sure your room is not dead silent and clap loudly once.");
          return;
        }

        await processAcousticQuery(compiledAudioBlob, mimeTypeSpec);
      };

      recorder.start();
      setMediaRecorder(recorder);
    } catch (e: any) {
      console.error("Failed to start MediaRecorder:", e);
      setErrorMsg("Acoustic hardware recording driver failure: " + (e?.message || e));
      setAppState("error");
    }
  };

  // Upload sound content server-side to Gemini Flash
  const processAcousticQuery = async (audioBlob: Blob, mimeType: string) => {
    setAppState("analyzing");

    try {
      // FileReader to convert blob to full Base64
      const reader = new FileReader();
      reader.readAsDataURL(audioBlob);
      reader.onloadend = async () => {
        const rawBase64Url = reader.result as string;

        const apiPayload = {
          audioData: rawBase64Url,
          mimeType,
          roomUse: roomUseText.trim() ||"General Space Optimizer"
        };

        const response = await fetch("/api/analyze-audio", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(apiPayload),
        });

        if (!response.ok) {
          const errDetail = await response.json().catch(() => ({}));
          throw new Error(errDetail?.error || `Gateway server error code ${response.status}`);
        }

        const data: AcousticReport = await response.json();
        setAcousticReport(data);

        // Save report into historical log nicely
        const updatedHistory = [data, ...historyReports.slice(0, 9)];
        setHistoryReports(updatedHistory);
        try {
          localStorage.setItem("acoustic_history", JSON.stringify(updatedHistory));
        } catch (storageErr) {
          console.warn("Storage limits triggered:", storageErr);
        }

        setAppState("success");
      };

      reader.onerror = () => {
        throw new Error("Could not read local microphone capture stream buffer.");
      };

    } catch (err: any) {
      console.error("API response breakdown:", err);
      setErrorMsg(err?.message || "Communication issue with Gemini Flash. Ensure web access is online.");
      setAppState("error");
    }
  };

  const resetScout = () => {
    setAcousticReport(null);
    setErrorMsg(null);
    setCountdown(3);
    setRecordingProgress(0);
    setAppState("idle");
  };

  const triggerHistoryImport = (reported: AcousticReport) => {
    setAcousticReport(reported);
    setAppState("success");
  };

  const getProfileHeaderStyle = (prof: string) => {
    const p = prof.toLowerCase();
    if (p.includes("bright") || p.includes("echo")) {
      return {
        title: "Bright / Highly Reflective Profile",
        desc: "Hard bounding surfaces (concrete, glass, wood floors) bouncing high-treble flutter reflections.",
        border: "border-white/10",
        shadow: "",
        textClr: "text-white",
        bgBadge: "bg-white/10"
      };
    }
    if (p.includes("muddy") || p.includes("boom")) {
      return {
        title: "Muddy / Low-End Concentrated",
        desc: "Exhibits heavy bass buildup, acoustic standing waves, or lack of corner bass trapping.",
        border: "border-white/10",
        shadow: "",
        textClr: "text-white",
        bgBadge: "bg-white/10"
      };
    }
    return {
      title: "Damped / Acoustically Dead",
      desc: "Massive absorption from thick carpets, fabrics, or beds. Lacks high-frequency spatial spark.",
      border: "border-white/10",
      shadow: "",
      textClr: "text-white",
      bgBadge: "bg-white/10"
    };
  };

  return (
    <div id="scout-viewport" className="min-h-screen bg-[#0A0A0A] text-white pb-16 flex flex-col items-center">
      
      {/* Editorial Navigation Border Rail */}
      <div className="w-full border-b border-white/10 bg-[#0A0A0A]/80 sticky top-0 z-40 backdrop-blur-md px-4 py-4 md:px-8">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span className="font-mono text-[10px] tracking-[0.3em] text-white/40 font-semibold uppercase">
              Signal Analysis / v2.02
            </span>
          </div>
          <span className="font-mono text-[10px] text-white/40 tracking-wider">
            {new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}
          </span>
        </div>
      </div>

      <main className="max-w-5xl w-full px-4 mt-8 flex flex-col grow justify-between">
        
        {/* Editorial Brand Statement */}
        <div className="w-full flex flex-col md:flex-row md:items-baseline justify-between border-b border-white/10 pb-6 mb-8 gap-2 text-center md:text-left">
          <div>
            <h1 className="text-5.5xl md:text-6xl font-serif font-light leading-none tracking-tighter text-white">
              Acoustic Scout
            </h1>
            <p className="font-mono text-white/40 text-[10pt] mt-1 uppercase tracking-[0.2em] leading-relaxed">
              Optimizing spatial acoustics with phone hardware &amp; Gemini Flash
            </p>
          </div>
          <span className="font-mono text-white/30 text-xs tracking-widest block mt-1 uppercase">
            Microphone Interface
          </span>
        </div>

        {/* Central Core Panel switcher based on state */}
        <div className="w-full">
          <AnimatePresence mode="wait">
            
            {/* IDLE state: Main screen */}
            {appState === "idle" && (
              <motion.div
                key="state-idle"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.3 }}
                className="grid grid-cols-1 gap-8"
              >
                {/* Visualizer Hero Block */}
                <div className="border border-white/10 bg-white/[0.02] p-8 rounded-2xl flex flex-col items-center text-center gap-8 relative overflow-hidden min-h-[360px] justify-center">
                  <div className="absolute inset-0 pointer-events-none opacity-40 dot-pattern" />
                  
                  <div className="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-white relative z-10">
                    <Mic className="w-5 h-5" />
                  </div>

                  <div className="max-w-lg relative z-10">
                    <span className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-3 block font-mono">Ready to Audit</span>
                    <h2 className="text-3xl sm:text-4xl font-serif font-light tracking-tight text-white leading-tight">
                      Ready to Sample Environment
                    </h2>
                    <p className="text-xs text-white/50 mt-3 leading-relaxed max-w-md mx-auto">
                      This system uses your local mic to capture high-resolution decay times, early-reflection tails, noise floor indices, and spectral profiles instantly.
                    </p>
                  </div>

                  {/* Inviting Circular Scanner Trigger */}
                  <div className="relative z-10 flex flex-col items-center gap-4">
                    <button
                      id="trigger-start-scan"
                      onClick={handleInitiateScan}
                      className="bg-white text-black font-sans font-semibold text-xs uppercase tracking-widest px-8 py-4 rounded-full hover:bg-white/90 active:scale-95 transition-all duration-300 shadow-xl cursor-pointer"
                    >
                      Start Room Audit
                    </button>
                    
                    <div className="flex gap-2 items-center justify-center text-[10px] font-mono text-white/40 border border-white/5 px-3 py-1 rounded-full bg-white/[0.02]">
                      <Sliders className="w-3.5 h-3.5 text-white/60" />
                      Protocol: 1 single clapping sound during the 5s window
                    </div>
                  </div>
                </div>

                {/* Preset Fast Actions */}
                <div className="border border-white/10 bg-white/[0.01] p-6 rounded-2xl flex flex-col gap-6">
                  <span className="font-mono text-[10px] text-white/40 uppercase tracking-[0.25em] leading-none">
                    Target Room Purpose Preset
                  </span>
                  
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {ROOM_PRESETS.map((p, i) => (
                      <button
                        key={i}
                        id={`preset-btn-${i}`}
                        onClick={() => setRoomUseText(p.value)}
                        className={`text-xs p-4 rounded-xl border font-mono tracking-wide text-left transition-all ${
                          roomUseText === p.value 
                            ? "bg-white/10 border-white text-white" 
                            : "bg-white/[0.02] border-white/5 text-white/60 hover:text-white hover:border-white/20"
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-col gap-2">
                    <label className="font-mono text-[9px] text-white/40 uppercase tracking-widest">
                      Custom Space Specification:
                    </label>
                    <input
                      id="room-use-input"
                      type="text"
                      className="w-full bg-white/[0.02] border border-white/10 focus:border-white/30 text-sm p-4 rounded-xl text-white transition-all font-sans placeholder-white/20 outline-none"
                      placeholder="e.g. Mixing electronic bass music, home office for Zoom calls, high-end hifi hearing room"
                      value={roomUseText}
                      onChange={(e) => setRoomUseText(e.target.value)}
                    />
                  </div>
                </div>

                {/* Historic Report Storage */}
                {historyReports.length > 0 && (
                  <div className="border border-white/10 bg-white/[0.01] p-6 rounded-2xl flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-white/70 border-b border-white/5 pb-3">
                      <History className="w-3.5 h-3.5 text-white/50" />
                      <span className="font-mono text-[10px] uppercase tracking-[0.25em] leading-none text-white/40">
                        Historical Audits
                      </span>
                    </div>
                    
                    <div className="divide-y divide-white/5 flex flex-col">
                      {historyReports.map((report, idx) => (
                        <div 
                          key={idx} 
                          id={`history-item-${idx}`}
                          className="flex items-center justify-between py-3 first:pt-0 last:pb-0 hover:bg-white/[0.02] cursor-pointer text-white/70 transition-colors"
                          onClick={() => triggerHistoryImport(report)}
                        >
                          <div className="flex flex-col">
                            <span className="text-xs font-serif font-light text-white/90">{report.summaryText.substring(0, 70)}...</span>
                            <span className="text-[9px] font-mono text-white/30 uppercase tracking-widest mt-1">{report.acousticProfile}</span>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-[10px] bg-white/5 px-2.5 py-1 rounded border border-white/10 text-white font-semibold">{report.acousticScore} pts</span>
                            <ArrowRight className="w-3.5 h-3.5 text-white/30" />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* COUNTDOWN state */}
            {appState === "countdown" && (
              <motion.div
                key="state-countdown"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 1.05 }}
                className="border border-white/10 bg-white/[0.01] p-8 rounded-2xl flex flex-col items-center justify-center text-center py-20 gap-8"
              >
                <span className="font-mono text-xs text-white/50 uppercase tracking-[0.3em] animate-pulse leading-none">
                  Acoustic Scout // Mic Initializing
                </span>
                
                <h3 className="text-sm font-sans text-white/60 max-w-sm">
                  Please hold perfectly quiet, prepare a sharp clap...
                </h3>

                {/* Huge Countdown Display */}
                <div id="countdown-banner" className="relative w-40 h-40 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border border-dashed border-white/10 animate-spin" style={{ animationDuration: "12s" }} />
                  <span className="text-8xl font-serif font-light text-white text-center leading-none">
                    {countdown}
                  </span>
                </div>

                <p className="font-mono text-[10px] text-white/30 uppercase tracking-widest">
                  Capturing room index in {countdown}s
                </p>
              </motion.div>
            )}

            {/* RECORDING state */}
            {appState === "recording" && (
              <motion.div
                key="state-recording"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="border border-white/10 bg-white/[0.01] p-8 rounded-2xl flex flex-col items-center justify-center text-center py-16 gap-8"
              >
                <div className="flex items-center gap-2 px-3 py-1.5 bg-white/5 border border-white/15 rounded-full text-white font-mono text-[9px] uppercase tracking-widest">
                  <div className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
                  AUDIO CAPTURE ACTIVE // 5S IMPULSE
                </div>

                <div className="max-w-md">
                  <h3 className="text-2.5xl font-serif font-light text-white tracking-tight leading-snug">
                    "Clap loudly once"
                  </h3>
                  <p className="text-xs text-white/50 font-sans mt-2 leading-relaxed">
                    A single sharp clap allows Gemini to instantly measure spatial reflection delay and echo frequency decay.
                  </p>
                </div>

                {/* Wave Visualizer block */}
                <div className="w-full max-w-lg">
                  <WaveformVisualizer stream={recordingStream} mode="listening" color="#ffffff" />
                </div>

                {/* Custom recording progress bar */}
                <div className="w-full max-w-xs flex flex-col gap-2 mt-2">
                  <div className="h-[2px] w-full bg-white/10 rounded-full overflow-hidden">
                    <div 
                      id="recording-progress-bar"
                      className="h-full bg-white transition-all duration-100 ease-linear rounded-full" 
                      style={{ width: `${recordingProgress}%` }}
                    />
                  </div>
                  <div className="flex justify-between font-mono text-[10px] text-white/40">
                    <span>Listening...</span>
                    <span>{Math.round((recordingProgress / 100) * 5)}s / 5s</span>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ANALYZING state */}
            {appState === "analyzing" && (
              <motion.div
                key="state-analyzing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="border border-white/10 bg-white/[0.01] p-8 rounded-2xl flex flex-col items-center justify-center text-center py-20 gap-8"
              >
                <div className="w-14 h-14 rounded-full border border-white/20 bg-white/5 flex items-center justify-center text-white">
                  <RefreshCw className="w-5 h-5 animate-spin" style={{ animationDuration: "3s" }} />
                </div>

                <div className="max-w-md">
                  <h3 className="text-2xl font-serif font-light text-white tracking-tight">
                    Analyzing Impulse Decay
                  </h3>
                  <p className="text-xs text-white/50 font-sans mt-2 leading-relaxed">
                    Gemini Flash is evaluating high-treble reflections, calculating the early RT60 metrics, and engineering targeted acoustic layout adjustments.
                  </p>
                </div>

                <div className="w-full max-w-lg">
                  <WaveformVisualizer stream={null} mode="sine" color="#ffffff" />
                </div>

                <div className="font-mono text-[9px] text-white/30 flex flex-wrap items-center justify-center gap-3">
                  <span className="animate-pulse">Measuring Impulse Decay (RT60)</span>
                  <span>/</span>
                  <span className="animate-pulse" style={{ animationDelay: "200ms" }}>Calibrating Reflections</span>
                  <span>/</span>
                  <span className="animate-pulse" style={{ animationDelay: "400ms" }}>Formatting Layout Revisions</span>
                </div>
              </motion.div>
            )}

            {/* SUCCESS state: Results render */}
            {appState === "success" && acousticReport && (
              <motion.div
                key="state-success"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="flex flex-col gap-8"
              >
                
                {/* Warning Mode (for missing server API Key sandbox) */}
                {acousticReport.isSimulated && (
                  <div className="border border-white/10 bg-white/[0.02] p-4 rounded-xl flex gap-3 text-white/70">
                    <AlertCircle className="w-4 h-4 text-white/50 flex-shrink-0 mt-0.5" />
                    <div className="flex flex-col gap-0.5 text-[11px] font-mono uppercase tracking-wide">
                      <span className="font-bold text-white">Sandbox Local Offline Emulation Mode</span>
                      <span className="text-white/40 font-normal normal-case">{acousticReport.warning}</span>
                    </div>
                  </div>
                )}

                {/* Bento Grid Row 1: Core diagnostics and classification */}
                <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                  
                  {/* Gauge (Score Card) */}
                  <div className="col-span-1 md:col-span-5 h-full">
                    <AcousticGauge score={acousticReport.acousticScore} />
                  </div>

                  {/* Room Profile Classification Badge & Details */}
                  <div className={`col-span-1 md:col-span-7 border p-8 rounded-2xl flex flex-col justify-between relative overflow-hidden bg-[#0F0F0F]/60 backdrop-blur-md ${getProfileHeaderStyle(acousticReport.acousticProfile).border}`}>
                    <div className="absolute inset-0 pointer-events-none opacity-[0.15] dot-pattern" />
                    
                    <span className="absolute top-6 right-6 font-mono text-[9px] text-white/30 uppercase tracking-[0.3em] leading-none">
                      Calculated Profile
                    </span>

                    <div className="flex flex-col gap-4 relative z-10">
                      <div>
                        <span className="text-[9px] font-mono uppercase tracking-[0.25em] text-white/40 block mb-1">
                          CLASSIFICATION
                        </span>
                        <h3 className="text-3xl sm:text-4xl font-serif font-light tracking-tight leading-snug text-white">
                          {acousticReport.acousticProfile}
                        </h3>
                      </div>
                      
                      <p className="text-xs font-sans text-white/60 leading-relaxed max-w-xl">
                        {getProfileHeaderStyle(acousticReport.acousticProfile).desc}
                      </p>
                    </div>

                    {/* Compact Specs list */}
                    <div className="grid grid-cols-3 gap-4 border-t border-white/10 pt-6 mt-8 font-mono text-center relative z-10">
                      <div className="flex flex-col">
                        <span className="text-[9px] text-white/40 uppercase tracking-widest">REVERB RT60</span>
                        <span className="text-sm font-sans font-semibold text-white mt-1.5">{acousticReport.metrics.reverbTimeMs} ms</span>
                      </div>
                      <div className="flex flex-col border-x border-white/10">
                        <span className="text-[9px] text-white/40 uppercase tracking-widest">NOISE FLOOR</span>
                        <span className="text-sm font-sans font-semibold text-white mt-1.5">{acousticReport.metrics.noiseFloorDb} dB</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[9px] text-white/40 uppercase tracking-widest">REFRACTION</span>
                        <span className="text-sm font-sans font-semibold text-white mt-1.5">{acousticReport.metrics.echoDensityPercentage}%</span>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Bento Grid Row 2: Comprehensive breakdown */}
                <div className="border border-white/10 bg-white/[0.01] p-8 rounded-2xl flex flex-col gap-6 relative overflow-hidden">
                  <div className="absolute inset-0 pointer-events-none opacity-[0.05] dot-pattern" />
                  
                  <div className="flex flex-col gap-1 relative z-10 border-b border-white/10 pb-4">
                    <div className="flex items-center gap-2 text-white/50">
                      <Activity className="w-3.5 h-3.5" />
                      <span className="font-mono text-[9px] uppercase tracking-[0.25em] leading-none">
                        Spectrographic Summary
                      </span>
                    </div>

                    <h4 className="text-[10px] font-mono text-white/70 uppercase tracking-[0.1em] mt-1">
                      TARGET: "{roomUseText || "General Space Optimizer"}"
                    </h4>
                  </div>

                  <p className="text-base font-serif font-light text-white/90 leading-relaxed relative z-10">
                    {acousticReport.summaryText}
                  </p>

                  {/* Sound spectrum sub-metrics bar charts */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-2 relative z-10">
                    
                    <div className="flex flex-col gap-2 text-xs">
                      <div className="flex justify-between font-mono text-white/40">
                        <span>TREBLE ABSORPTIVE RATIO (MIDS/HIGHS)</span>
                        <span className="text-white font-semibold">{acousticReport.metrics.absorptionRating}/100</span>
                      </div>
                      <div className="h-[2px] w-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-white transition-all duration-500" style={{ width: `${acousticReport.metrics.absorptionRating}%` }} />
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-2 text-xs">
                      <div className="flex justify-between font-mono text-white/40">
                        <span>BASS STANDING RESONANCE CONTROL</span>
                        <span className="text-white font-semibold">{acousticReport.metrics.bassTamingRating}/100</span>
                      </div>
                      <div className="h-[2px] w-full bg-white/10 overflow-hidden">
                        <div className="h-full bg-white transition-all duration-500" style={{ width: `${acousticReport.metrics.bassTamingRating}%` }} />
                      </div>
                    </div>

                  </div>
                </div>

                {/* Big Recommendations Block */}
                <div className="flex flex-col gap-6 mt-4">
                  <div className="flex items-center gap-2">
                    <Compass className="w-4 h-4 text-white/60" />
                    <h3 className="text-xl font-serif font-light tracking-tight text-white uppercase">
                      Actionable Room Arrangement Tweaks
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {acousticReport.recommendations.map((rec, i) => (
                      <RecommendationCard key={i} recommendation={rec} index={i} />
                    ))}
                  </div>
                </div>

                {/* Submitting custom targeted queries at the bottom */}
                <div className="border border-white/10 bg-white/[0.01] p-6 rounded-2xl mt-4 flex flex-col gap-6 relative overflow-hidden">
                  <div className="absolute inset-0 pointer-events-none opacity-[0.05] dot-pattern" />
                  
                  <div className="flex flex-col gap-1.5 relative z-10">
                    <span className="font-mono text-[9px] text-white/45 uppercase tracking-[0.25em] leading-none">
                      Re-Analyze with a different target purpose
                    </span>
                    <p className="text-xs text-white/40">
                      Want to optimize the space for another utility? Enter a different purpose configuration above. You don't need to clap again — we will instantly re-analyze using the current environmental sweep index!
                    </p>
                  </div>

                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center relative z-10">
                    <input
                      id="room-use-re-submit"
                      type="text"
                      className="grow bg-white/[0.02] border border-white/10 focus:border-white/30 text-xs p-4 rounded-xl text-white transition-all outline-none"
                      placeholder="e.g. Dedicated Music Studio, Bedroom Studio, Video Conferencing"
                      value={roomUseText}
                      onChange={(e) => setRoomUseText(e.target.value)}
                    />
                    
                    <button
                      id="re-submit-analysis"
                      disabled={appState === "analyzing"}
                      onClick={async () => {
                        handleInitiateScan();
                      }}
                      className="whitespace-nowrap inline-flex items-center justify-center gap-2 px-6 py-4 bg-white hover:bg-white/90 text-black text-xs rounded-full font-mono uppercase tracking-widest cursor-pointer transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Re-Test Space
                    </button>
                  </div>

                  <div className="flex items-center justify-center pt-2 relative z-10">
                    <button
                      id="full-reset-scout"
                      onClick={resetScout}
                      className="text-xs text-white/40 hover:text-white underline transition-colors cursor-pointer font-mono uppercase tracking-widest text-[9px]"
                    >
                      Return to Welcome Screen
                    </button>
                  </div>
                </div>

              </motion.div>
            )}

            {/* ERROR state */}
            {appState === "error" && (
              <motion.div
                key="state-error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="border border-red-500/30 bg-red-950/10 p-8 rounded-2xl flex flex-col items-center justify-center text-center py-16 gap-6"
              >
                <div className="w-12 h-12 rounded-full bg-red-900/20 border border-red-500/30 flex items-center justify-center text-red-200">
                  <AlertCircle className="w-5 h-5" />
                </div>

                <div className="max-w-md">
                  <h3 className="text-xl font-serif font-light text-white tracking-tight">
                    Microphone Calibration Halted
                  </h3>
                  <p className="text-xs text-white/50 font-sans mt-2 leading-relaxed">
                    {errorMsg || "An unknown hardware or network block happened during the room scan."}
                  </p>
                </div>

                <div className="flex flex-col gap-3 mt-4 w-full max-w-xs">
                  <button
                    id="retry-app-scan"
                    onClick={handleInitiateScan}
                    className="w-full py-4 bg-white text-black font-mono text-xs font-semibold uppercase tracking-widest rounded-full hover:bg-white/90 cursor-pointer transition-colors"
                  >
                    Allow Microphone &amp; Retry
                  </button>
                  
                  <button
                    id="back-to-idle-err"
                    onClick={resetScout}
                    className="w-full py-3 bg-white/5 border border-white/10 text-white/60 font-mono text-xs uppercase tracking-widest rounded-full hover:text-white cursor-pointer transition-colors"
                  >
                    Go Back to Dashboard
                  </button>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>

      </main>

      {/* Aesthetic Footer watermark */}
      <footer className="w-full max-w-5xl mx-auto px-4 mt-20 text-center text-[9px] font-mono text-white/30 border-t border-white/10 pt-6 flex flex-col gap-2 relative">
        <span className="tracking-[0.2em] uppercase">ACOUSTIC SCOUT — LICENSED FOR PROFESSIONAL SPATIAL RECONSTRUCTIVE ANALYTICS</span>
        <span className="tracking-widest opacity-60">© 2026 // EMULATED IMPULSE MEASURING SCHEMAS</span>
      </footer>

    </div>
  );
}

