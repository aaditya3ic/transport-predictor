import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mode, distance, inputs } = body;
    const { hour, month, weather, congestion } = inputs;

      
      const mlResponse = await fetch("https://transport-predictor.onrender.com/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, distance, hour, month, weather, congestion })
      });
      const data = await mlResponse.json();
     return NextResponse.json(data);
     
    const peak = (hour >= 7 && hour <= 10) || (hour >= 17 && hour <= 21);
    const winter = month === 12 || month <= 2;
    const monsoon = month >= 6 && month <= 9;
    
    const raw: [string, number][] = mode === "flight"
      ? [
          ["Weather", 30 * weather], 
          ["Airport congestion", 24 * congestion], 
          ["Peak-hour rush", peak ? 10 : 0],
          ["Monsoon season", monsoon ? 7 : 0], 
          ["Distance and turnaround", distance / 450], 
          ["Baseline", 5]
        ]
      : [
          ["Weather", 20 * weather], 
          ["Track congestion", 28 * congestion],
          ["Winter fog", winter ? 32 * (0.4 + 0.6 * weather) : 0], 
          ["Peak-hour traffic", peak ? 8 : 0],
          ["Monsoon season", monsoon ? 10 : 0], 
          ["Distance and halts", distance / 110], 
          ["Baseline", 12]
        ];

    const delay = Math.round(raw.reduce((s, [, m]) => s + m, 0));
    const mid = mode === "flight" ? 15 : 30;
    
    const prediction = {
      delay,
      probability: 1 / (1 + Math.exp(-(delay - mid) / 8)),
      factors: raw.filter(([, m]) => m >= 1).sort((p, q) => q[1] - p[1]),
    };

    // Simulate network delay for realism
    await new Promise((resolve) => setTimeout(resolve, 600));

    return NextResponse.json(prediction);
  } catch (error) {
    return NextResponse.json({ error: "Failed to process prediction" }, { status: 500 });
  }
}