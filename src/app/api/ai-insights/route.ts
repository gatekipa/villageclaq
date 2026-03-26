import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { groupStats, locale } = await req.json();

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ insight: "AI insights require configuration." }, { status: 200 });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-20241022",
        max_tokens: 300,
        messages: [{
          role: "user",
          content: `You are a financial analyst for an African community group. Analyze this data and provide 3-4 key insights in plain language. Mention specific numbers. Flag concerns. Suggest actions. Keep it under 150 words. Respond in ${locale === 'fr' ? 'French' : 'English'}.\n\nGroup Stats:\n${JSON.stringify(groupStats, null, 2)}`
        }]
      })
    });

    if (!response.ok) {
      return NextResponse.json({ insight: "AI insights temporarily unavailable." }, { status: 200 });
    }

    const data = await response.json();
    const insight = data.content?.[0]?.text || "No insights generated.";
    return NextResponse.json({ insight });
  } catch {
    return NextResponse.json({ insight: "AI insights temporarily unavailable." }, { status: 200 });
  }
}
