/**
 * AI Report Insights Service
 * Uses Anthropic Claude API to generate natural language insights from report data.
 * Caches results for 24 hours per report to minimize API costs.
 */

// TODO: Install @anthropic-ai/sdk and add ANTHROPIC_API_KEY to .env.local
// import Anthropic from '@anthropic-ai/sdk';

interface InsightRequest {
  reportId: string;
  reportType: string;
  reportData: Record<string, unknown>;
  locale: 'en' | 'fr';
  groupName: string;
}

interface InsightResponse {
  insights: string;
  generatedAt: string;
  cached: boolean;
}

// In-memory cache (in production, use Redis or Supabase)
const insightsCache = new Map<string, { insights: string; generatedAt: string; expiresAt: number }>();

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getCacheKey(reportId: string, locale: string): string {
  return `${reportId}:${locale}`;
}

const SYSTEM_PROMPT = {
  en: `You are a financial analyst for an African community group. Analyze this data and provide 3-4 key insights in plain language. Mention specific numbers. Flag concerns. Suggest actions. Keep it under 150 words.`,
  fr: `Vous êtes un analyste financier pour un groupe communautaire africain. Analysez ces données et fournissez 3-4 points clés en langage clair. Mentionnez des chiffres spécifiques. Signalez les préoccupations. Suggérez des actions. Restez sous 150 mots.`,
};

export async function generateReportInsights(
  request: InsightRequest
): Promise<InsightResponse> {
  const cacheKey = getCacheKey(request.reportId, request.locale);

  // Check cache first
  const cached = insightsCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      insights: cached.insights,
      generatedAt: cached.generatedAt,
      cached: true,
    };
  }

  try {
    // TODO: Replace with actual Anthropic API call when API key is configured
    // const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    // const message = await anthropic.messages.create({
    //   model: 'claude-3-haiku-20240307',
    //   max_tokens: 300,
    //   system: SYSTEM_PROMPT[request.locale],
    //   messages: [{
    //     role: 'user',
    //     content: `Report: ${request.reportType} for ${request.groupName}\n\nData:\n${JSON.stringify(request.reportData, null, 2)}\n\nProvide insights in ${request.locale === 'fr' ? 'French' : 'English'}.`,
    //   }],
    // });
    // const insights = message.content[0].type === 'text' ? message.content[0].text : '';

    // Placeholder response until API is wired up
    const insights = request.locale === 'fr'
      ? `📊 **Analyse en cours de développement**\n\nLes analyses IA pour ce rapport seront disponibles avec le plan Pro. Elles incluront des résumés automatiques, des alertes de tendance et des recommandations d'action personnalisées pour ${request.groupName}.`
      : `📊 **Insights Coming Soon**\n\nAI-powered insights for this report will be available with the Pro plan. They'll include automatic summaries, trend alerts, and personalized action recommendations for ${request.groupName}.`;

    const generatedAt = new Date().toISOString();

    // Cache the result
    insightsCache.set(cacheKey, {
      insights,
      generatedAt,
      expiresAt: Date.now() + CACHE_TTL_MS,
    });

    return { insights, generatedAt, cached: false };
  } catch (error) {
    console.error('Failed to generate AI insights:', error);
    throw new Error('Unable to generate insights');
  }
}

export function clearInsightsCache(reportId?: string, locale?: string): void {
  if (reportId && locale) {
    insightsCache.delete(getCacheKey(reportId, locale));
  } else if (reportId) {
    for (const key of insightsCache.keys()) {
      if (key.startsWith(reportId)) {
        insightsCache.delete(key);
      }
    }
  } else {
    insightsCache.clear();
  }
}

// Utility: format report data for the AI prompt
export function formatReportDataForAI(
  reportType: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any
): Record<string, unknown> {
  switch (reportType) {
    case 'who-hasnt-paid':
      return {
        totalOutstanding: data.totalOutstanding,
        membersCount: data.members?.length,
        topDebtors: data.members?.slice(0, 5),
        averageOverdue: data.averageOverdueDays,
      };
    case 'annual-financial-summary':
      return {
        totalCollected: data.totalCollected,
        totalExpected: data.totalExpected,
        collectionRate: data.collectionRate,
        byMonth: data.byMonth,
      };
    case 'member-standing':
      return {
        totalMembers: data.totalMembers,
        goodStanding: data.goodStanding,
        warning: data.warning,
        suspended: data.suspended,
      };
    case 'attendance-summary':
      return {
        averageRate: data.averageRate,
        totalEvents: data.totalEvents,
        bestAttendance: data.bestAttendance,
        worstAttendance: data.worstAttendance,
      };
    default:
      return data;
  }
}
