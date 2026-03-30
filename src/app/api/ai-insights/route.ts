import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Simple in-memory rate limiter: 20 requests per minute per user
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export async function POST(req: NextRequest) {
  try {
    // ── Auth check: caller must be a logged-in user ──
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Rate limit: 20 requests / minute per user ──
    const now = Date.now();
    const rl = rateLimitMap.get(user.id);
    if (rl && rl.resetAt > now) {
      if (rl.count >= 20) {
        return NextResponse.json({ error: "rate_limited" }, { status: 429 });
      }
      rl.count++;
    } else {
      rateLimitMap.set(user.id, { count: 1, resetAt: now + 60000 });
    }

    const { reportType, reportData, locale } = await req.json();

    if (!reportData || !reportType) {
      return NextResponse.json({ error: "Missing reportType or reportData" }, { status: 400 });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      // 503: service unavailable — graceful degradation
      return NextResponse.json({ error: "unavailable" }, { status: 503 });
    }

    const langInstruction = locale === "fr"
      ? "IMPORTANT: Respond entirely in French. All headings, analysis, bullet points, recommendations, and action items MUST be written in French. Do not use any English words or phrases."
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
          content: `You are a financial analyst for an African community group (njangi/alumni union/village association). Analyze this "${reportType}" report data and provide 3-5 actionable insights. Use markdown formatting: ## for section headings, **bold** for emphasis, numbered lists for recommendations. Be specific with numbers. Flag concerns. Suggest actions. Keep it under 300 words. ${langInstruction}\n\nReport data:\n${JSON.stringify(reportData, null, 2).slice(0, 8000)}`
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Anthropic API error:", response.status, errorText);
      return NextResponse.json({ error: "unavailable" }, { status: 502 });
    }

    const data = await response.json();
    const insights = data.content?.[0]?.text || "";
    if (!insights) {
      return NextResponse.json({ error: "unavailable" }, { status: 502 });
    }
    return NextResponse.json({ insights });
  } catch (error) {
    console.error("AI Insights error:", error);
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  }
}
