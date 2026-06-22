import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up JSON body parser with increased limit to handle base64 audio files
app.use(express.json({ limit: "15mb" }));

// Initialize the GoogleGenAI instance server-side ONLY.
// Set 'User-Agent': 'aistudio-build' for telemetry as requested.
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("WARNING: GEMINI_API_KEY is not defined in the environment.");
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

// API routes first
app.post("/api/analyze-audio", async (req, res) => {
  try {
    const { audioData, mimeType, roomUse } = req.body;

    if (!audioData) {
      return res.status(400).json({ error: "No audio data provided." });
    }

    const ai = getGeminiClient();
    if (!ai) {
      // In development or if api key is missing, provide fallback mock data 
      // but warn properly, so the app remains perfectly functional and nice.
      console.log("Serving simulated analysis because GEMINI_API_KEY is missing/invalid.");
      
      const simulatedData = getSimulatedData(roomUse || "General Space");
      return res.json({
        ...simulatedData,
        isSimulated: true,
        warning: "Acoustic Scout running in Offline/Demo mode. Set up GEMINI_API_KEY in the secrets tab for real live analysis!"
      });
    }

    // Convert the base64 string to part-compatible inlineData
    // Usually the payload is "data:audio/...;base64,AAAA..." or just "AAAA..."
    let base64String = audioData;
    if (audioData.includes("base64,")) {
      base64String = audioData.split("base64,")[1];
    }

    const audioPart = {
      inlineData: {
        mimeType: mimeType || "audio/webm",
        data: base64String,
      },
    };

    const targetRoomUse = roomUse || "General Purpose";

    const promptText = `
You are a professional acoustic consultant and audio engineer.
You are evaluating a 5-second room response audio clip recorded by the user's phone.
The user was instructed to 'Snap your fingers or clap loudly once' to trigger the room's impulse response.
The user states they intend to use this room as a: "${targetRoomUse}".

Examine the audio clip for the following parameters:
1. Impulse response decay rate and echo characteristics (reverb time).
2. Frequency absorption profile (is it echoey, boomy, or muddy, or very dead/damped).
3. Background system noises, airflow hums, or ambient hiss.

Classify the room into one of these 3 profiles:
- 'Bright/Echoey' (has lots of hard flat surfaces, sparse furniture, fluttering echo).
- 'Muddy/Boomy' (buildup of low-end frequencies, corners echoing, standing waves).
- 'Damped/Dead' (has heavy rugs, curtains, soft beds, or too much dense absorption leading to lack of natural sound life).

Calculate an Acoustic Scorecard (0 to 100) where:
- 100 is a perfectly tuned studio or beautifully isolated, balanced office room.
- 70-89 is a good comfortable space.
- Under 70 indicates heavy resonance, flutter echo, or high noise floors that can tire speakers and listeners.

Provide exactly 3 custom, highly actionable interior design, acoustics, or furniture arrangement recommendations tailored to the user's intended room use ("${targetRoomUse}"). Each recommendation should feel extremely practical (e.g., placing specific household items, rugs, positioning a desk away from corners, hanging bookshelves to behave as diffusers). Do not offer generic audio hardware solutions; prioritize physical, room-centric acoustic design adjustments.

Make sure to format the entire response strictly as a JSON object adhering to the schema.
`;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        audioPart,
        { text: promptText }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            acousticProfile: {
              type: Type.STRING,
              description: "Must be exactly one of: 'Bright/Echoey', 'Muddy/Boomy', or 'Damped/Dead'."
            },
            acousticScore: {
              type: Type.INTEGER,
              description: "An overall acoustics quality score from 10 to 100."
            },
            metrics: {
              type: Type.OBJECT,
              properties: {
                reverbTimeMs: {
                  type: Type.INTEGER,
                  description: "Estimated sound decay decay rate/RT60 in milliseconds."
                },
                echoDensityPercentage: {
                  type: Type.INTEGER,
                  description: "Percentage (0-100) of early reflections."
                },
                noiseFloorDb: {
                  type: Type.INTEGER,
                  description: "Background noise floor in decibels (dB)."
                },
                absorptionRating: {
                  type: Type.INTEGER,
                  description: "A scale (0-100) indicating mid/high-frequency absorption."
                },
                bassTamingRating: {
                  type: Type.INTEGER,
                  description: "A scale (0-100) indicating low-frequency taming."
                }
              },
              required: ["reverbTimeMs", "echoDensityPercentage", "noiseFloorDb", "absorptionRating", "bassTamingRating"]
            },
            summaryText: {
              type: Type.STRING,
              description: "A professional, scannable summaries paragraph explaining the echo/reverb profile in relation to being used as a " + targetRoomUse + "."
            },
            recommendations: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: {
                    type: Type.STRING,
                    description: "Short specific directive (e.g. 'Add a Plush Area Rug under Desk', 'Stagger Wall Bookshelves')."
                  },
                  category: {
                    type: Type.STRING,
                    description: "Category label e.g., 'Flooring', 'Wall Treatment', 'Furniture Setup'."
                  },
                  detail: {
                    type: Type.STRING,
                    description: "2 sentences explaining exactly where to place it and how it diffuses or absorbs specific flutter echoes."
                  },
                  impact: {
                    type: Type.STRING,
                    description: "The intended acoustic benefit (e.g. 'Eliminates desktop reflection', 'Diffuses mid-frequency clutter')."
                  },
                  priority: {
                    type: Type.STRING,
                    description: "Priority level: 'High', 'Medium', or 'Low'."
                  }
                },
                required: ["title", "category", "detail", "impact", "priority"]
              },
              description: "Must be exactly 3 highly specific physical recommendations."
            }
          },
          required: ["acousticProfile", "acousticScore", "metrics", "summaryText", "recommendations"]
        }
      }
    });

    const bodyText = response.text;
    if (!bodyText) {
      throw new Error("Received an empty response from Gemini Flash.");
    }

    try {
      const parsed = JSON.parse(bodyText.trim());
      return res.json(parsed);
    } catch (parseError) {
      console.error("JSON parse error from Gemini text:", bodyText, parseError);
      return res.status(500).json({ error: "Failed to parse acoustic analysis data.", rawText: bodyText });
    }

  } catch (error: any) {
    console.error("Endpoint Error in analyze-audio:", error);
    return res.status(500).json({
      error: "Error processing the acoustic scan.",
      details: error?.message || String(error)
    });
  }
});

// Helper for simulated data fallback
function getSimulatedData(roomUse: string) {
  const isOffice = roomUse.toLowerCase().includes("office") || roomUse.toLowerCase().includes("call") || roomUse.toLowerCase().includes("work");
  const isMusic = roomUse.toLowerCase().includes("music") || roomUse.toLowerCase().includes("listen") || roomUse.toLowerCase().includes("studio");
  
  const profiles = ["Bright/Echoey", "Muddy/Boomy", "Damped/Dead"];
  // Random default but nice setup
  const acousticProfile: string = isOffice ? "Bright/Echoey" : (isMusic ? "Muddy/Boomy" : "Bright/Echoey");
  const score = isOffice ? 68 : (isMusic ? 55 : 74);

  return {
    acousticProfile,
    acousticScore: score,
    metrics: {
      reverbTimeMs: acousticProfile === "Bright/Echoey" ? 920 : (acousticProfile === "Muddy/Boomy" ? 1150 : 340),
      echoDensityPercentage: acousticProfile === "Bright/Echoey" ? 35 : (acousticProfile === "Muddy/Boomy" ? 64 : 85),
      noiseFloorDb: 38,
      absorptionRating: acousticProfile === "Damped/Dead" ? 90 : 25,
      bassTamingRating: acousticProfile === "Muddy/Boomy" ? 15 : 55
    },
    summaryText: `Your room suffers from noticeable acoustic reflections and standing impulses, making it sound somewhat ${acousticProfile.toLowerCase()}. This decreases vocal and listening clarity when set up for ${roomUse}. Adopting targeted physical layouts will substantially elevate your sound signature.`,
    recommendations: [
      {
        title: "Deploy a Dense Area Rug",
        category: "Flooring",
        detail: "Position a high-pile woven rug centered on your floor. This interrupts hard parallel floor-to-ceiling reflections that cause flutter echoes during voice calls.",
        impact: "Absorbs harsh high treble splash-back",
        priority: "High"
      },
      {
        title: "Offset Wall Art or Bookshelves",
        category: "Wall Treatment",
        detail: "Install open bookshelves filled with books at varied depths directly opposite your desk/chair. This functions as a natural scattering acoustic diffuser.",
        impact: "Scatters mid-frequency sound waves evenly",
        priority: "Medium"
      },
      {
        title: "Incorporate Heavy Fabric Curtains",
        category: "Window Treatment",
        detail: "Hang thick linen or velvet draperies over naked glass window frames. Glass reflects almost 98% of high-end energy; curtains introduce crucial soft absorption.",
        impact: "Improves speech isolation and speech intelligibility",
        priority: "High"
      }
    ]
  };
}

// Vite and static asset server setup
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Acoustic Scout server securely listening at http://localhost:${PORT}`);
  });
}

startServer();
