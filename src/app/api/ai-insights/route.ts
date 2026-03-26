import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { reportType, reportData, locale } = await req.json();

    if (!reportData || !reportType) {
      return NextResponse.json({ error: "Missing reportType or reportData" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "AI service not configured" }, { status: 500 });
    }

    const langInstruction = locale === "fr"
      ? "Respond entirely in French."
      : "Respond entirely in English.";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1024,
        messages: [{
          role: "user",
          content: `You are a financial analyst for an African community group (njangi/alumni union/village association). Analyze this "${reportType}" report data and provide 3-5 actionable insights. Be specific with numbers. Flag concerns. Suggest actions. Keep it under 200 words. ${langInstruction}\n\nReport data:\n${JSON.stringify(reportData, null, 2)}`
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error:", errorText);
      return NextResponse.json({ error: "AI service unavailable" }, { status: 502 });
    }

    const data = await response.json();
    const insights = data.content?.[0]?.text || "No insights generated.";
    return NextResponse.json({ insights });
  } catch (error) {
    console.error("AI Insights error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
