// ─── WhatsApp Business API Template Definitions ─────────────────────────────
//
// These templates must be registered with Meta (WhatsApp Business API) before use.
// Template names and structures follow WhatsApp's template message format.
// Parameters use {{1}}, {{2}}, etc. as WhatsApp placeholders.
//
// TODO: Register these templates via the WhatsApp Business API or Meta Business Manager.
// TODO: Set WHATSAPP_BUSINESS_PHONE_ID and WHATSAPP_ACCESS_TOKEN env vars.

type Locale = 'en' | 'fr';

type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';

interface TemplateComponent {
  type: 'HEADER' | 'BODY' | 'FOOTER' | 'BUTTONS';
  format?: 'TEXT' | 'IMAGE' | 'DOCUMENT';
  text?: string;
  buttons?: Array<{
    type: 'URL' | 'QUICK_REPLY';
    text: string;
    url?: string;
  }>;
}

interface WhatsAppTemplate {
  name: string;
  languages: {
    en: {
      category: TemplateCategory;
      components: TemplateComponent[];
    };
    fr: {
      category: TemplateCategory;
      components: TemplateComponent[];
    };
  };
}

// ─── Template Definitions ───────────────────────────────────────────────────

export const WHATSAPP_TEMPLATES: Record<string, WhatsAppTemplate> = {
  payment_receipt: {
    name: 'villageclaq_payment_receipt',
    languages: {
      en: {
        category: 'UTILITY',
        components: [
          {
            type: 'HEADER',
            format: 'TEXT',
            text: 'Payment Confirmed',
          },
          {
            type: 'BODY',
            text: 'Hi {{1}}, your payment of {{2}} {{3}} to {{4}} has been recorded on {{5}}. Method: {{6}}. Thank you!',
          },
          {
            type: 'FOOTER',
            text: 'VillageClaq — villageclaq.com',
          },
        ],
      },
      fr: {
        category: 'UTILITY',
        components: [
          {
            type: 'HEADER',
            format: 'TEXT',
            text: 'Paiement confirm\u00e9',
          },
          {
            type: 'BODY',
            text: 'Bonjour {{1}}, votre paiement de {{2}} {{3}} \u00e0 {{4}} a \u00e9t\u00e9 enregistr\u00e9 le {{5}}. M\u00e9thode: {{6}}. Merci !',
          },
          {
            type: 'FOOTER',
            text: 'VillageClaq — villageclaq.com',
          },
        ],
      },
    },
  },

  payment_reminder: {
    name: 'villageclaq_payment_reminder',
    languages: {
      en: {
        category: 'UTILITY',
        components: [
          {
            type: 'HEADER',
            format: 'TEXT',
            text: 'Payment Reminder',
          },
          {
            type: 'BODY',
            text: 'Hi {{1}}, your {{2}} payment of {{3}} {{4}} to {{5}} was due on {{6}}. Please make your payment to stay in good standing.',
          },
          {
            type: 'FOOTER',
            text: 'VillageClaq — villageclaq.com',
          },
          {
            type: 'BUTTONS',
            buttons: [
              {
                type: 'URL',
                text: 'Pay Now',
                url: '{{7}}',
              },
            ],
          },
        ],
      },
      fr: {
        category: 'UTILITY',
        components: [
          {
            type: 'HEADER',
            format: 'TEXT',
            text: 'Rappel de paiement',
          },
          {
            type: 'BODY',
            text: 'Bonjour {{1}}, votre paiement {{2}} de {{3}} {{4}} \u00e0 {{5}} \u00e9tait d\u00fb le {{6}}. Veuillez effectuer votre paiement pour rester en r\u00e8gle.',
          },
          {
            type: 'FOOTER',
            text: 'VillageClaq — villageclaq.com',
          },
          {
            type: 'BUTTONS',
            buttons: [
              {
                type: 'URL',
                text: 'Payer maintenant',
                url: '{{7}}',
              },
            ],
          },
        ],
      },
    },
  },

  event_reminder: {
    name: 'villageclaq_event_reminder',
    languages: {
      en: {
        category: 'UTILITY',
        components: [
          {
            type: 'HEADER',
            format: 'TEXT',
            text: 'Upcoming Event',
          },
          {
            type: 'BODY',
            text: 'Hi {{1}}, reminder: {{2}} with {{3}} is on {{4}} at {{5}} ({{6}}). See you there!',
          },
          {
            type: 'FOOTER',
            text: 'VillageClaq — villageclaq.com',
          },
          {
            type: 'BUTTONS',
            buttons: [
              {
                type: 'URL',
                text: 'View Event',
                url: '{{7}}',
              },
            ],
          },
        ],
      },
      fr: {
        category: 'UTILITY',
        components: [
          {
            type: 'HEADER',
            format: 'TEXT',
            text: '\u00c9v\u00e9nement \u00e0 venir',
          },
          {
            type: 'BODY',
            text: 'Bonjour {{1}}, rappel : {{2}} avec {{3}} le {{4}} \u00e0 {{5}} ({{6}}). \u00c0 bient\u00f4t !',
          },
          {
            type: 'FOOTER',
            text: 'VillageClaq — villageclaq.com',
          },
          {
            type: 'BUTTONS',
            buttons: [
              {
                type: 'URL',
                text: 'Voir l\'\u00e9v\u00e9nement',
                url: '{{7}}',
              },
            ],
          },
        ],
      },
    },
  },

  minutes_published: {
    name: 'villageclaq_minutes_published',
    languages: {
      en: {
        category: 'UTILITY',
        components: [
          {
            type: 'HEADER',
            format: 'TEXT',
            text: 'Minutes Published',
          },
          {
            type: 'BODY',
            text: 'Hi {{1}}, the minutes for {{2}} ({{3}}) in {{4}} have been published. Check the summary and action items.',
          },
          {
            type: 'FOOTER',
            text: 'VillageClaq — villageclaq.com',
          },
          {
            type: 'BUTTONS',
            buttons: [
              {
                type: 'URL',
                text: 'Read Minutes',
                url: '{{5}}',
              },
            ],
          },
        ],
      },
      fr: {
        category: 'UTILITY',
        components: [
          {
            type: 'HEADER',
            format: 'TEXT',
            text: 'Compte rendu publi\u00e9',
          },
          {
            type: 'BODY',
            text: 'Bonjour {{1}}, le compte rendu de {{2}} ({{3}}) dans {{4}} a \u00e9t\u00e9 publi\u00e9. Consultez le r\u00e9sum\u00e9 et les actions.',
          },
          {
            type: 'FOOTER',
            text: 'VillageClaq — villageclaq.com',
          },
          {
            type: 'BUTTONS',
            buttons: [
              {
                type: 'URL',
                text: 'Lire le compte rendu',
                url: '{{5}}',
              },
            ],
          },
        ],
      },
    },
  },

  welcome_message: {
    name: 'villageclaq_welcome',
    languages: {
      en: {
        category: 'MARKETING',
        components: [
          {
            type: 'HEADER',
            format: 'TEXT',
            text: 'Welcome to {{1}}!',
          },
          {
            type: 'BODY',
            text: 'Hi {{2}}, you have been added to {{1}} on VillageClaq. Get started by exploring your group dashboard and connecting with other members.',
          },
          {
            type: 'FOOTER',
            text: 'VillageClaq — villageclaq.com',
          },
          {
            type: 'BUTTONS',
            buttons: [
              {
                type: 'URL',
                text: 'Get Started',
                url: '{{3}}',
              },
            ],
          },
        ],
      },
      fr: {
        category: 'MARKETING',
        components: [
          {
            type: 'HEADER',
            format: 'TEXT',
            text: 'Bienvenue dans {{1}} !',
          },
          {
            type: 'BODY',
            text: 'Bonjour {{2}}, vous avez \u00e9t\u00e9 ajout\u00e9(e) \u00e0 {{1}} sur VillageClaq. Commencez par explorer le tableau de bord de votre groupe.',
          },
          {
            type: 'FOOTER',
            text: 'VillageClaq — villageclaq.com',
          },
          {
            type: 'BUTTONS',
            buttons: [
              {
                type: 'URL',
                text: 'Commencer',
                url: '{{3}}',
              },
            ],
          },
        ],
      },
    },
  },

  meeting_pack: {
    name: 'villageclaq_meeting_pack',
    languages: {
      en: {
        category: 'UTILITY',
        components: [
          {
            type: 'HEADER',
            format: 'DOCUMENT',
          },
          {
            type: 'BODY',
            text: 'Hi {{1}}, here is the meeting pack for {{2}} on {{3}} with {{4}}. It includes the agenda, previous minutes, and financial summary.',
          },
          {
            type: 'FOOTER',
            text: 'VillageClaq — villageclaq.com',
          },
        ],
      },
      fr: {
        category: 'UTILITY',
        components: [
          {
            type: 'HEADER',
            format: 'DOCUMENT',
          },
          {
            type: 'BODY',
            text: 'Bonjour {{1}}, voici le dossier de r\u00e9union pour {{2}} le {{3}} avec {{4}}. Il comprend l\'ordre du jour, le compte rendu pr\u00e9c\u00e9dent et le r\u00e9sum\u00e9 financier.',
          },
          {
            type: 'FOOTER',
            text: 'VillageClaq — villageclaq.com',
          },
        ],
      },
    },
  },
};

// ─── Helper: Build WhatsApp Message Object ──────────────────────────────────

interface WhatsAppMessagePayload {
  messaging_product: 'whatsapp';
  to: string;
  type: 'template';
  template: {
    name: string;
    language: { code: string };
    components: Array<{
      type: string;
      parameters: Array<{
        type: 'text' | 'document' | 'image';
        text?: string;
        document?: { link: string; filename: string };
      }>;
    }>;
  };
}

/**
 * Build the structured WhatsApp Business API message payload for a given template.
 *
 * @param templateName - Key from WHATSAPP_TEMPLATES (e.g. 'payment_receipt')
 * @param params - Ordered array of parameter values to fill {{1}}, {{2}}, etc.
 * @param locale - 'en' or 'fr'
 * @param recipientPhone - Recipient's phone number in international format (e.g. '+237...')
 * @param documentUrl - Optional document URL for templates with DOCUMENT headers
 * @param documentFilename - Optional filename for the document
 */
export function buildWhatsAppMessage(
  templateName: string,
  params: string[],
  locale: Locale,
  recipientPhone: string,
  documentUrl?: string,
  documentFilename?: string
): WhatsAppMessagePayload {
  const template = WHATSAPP_TEMPLATES[templateName];
  if (!template) {
    throw new Error(`WhatsApp template "${templateName}" not found`);
  }

  const langDef = template.languages[locale];
  const languageCode = locale === 'fr' ? 'fr' : 'en';

  const components: WhatsAppMessagePayload['template']['components'] = [];

  for (const component of langDef.components) {
    if (component.type === 'HEADER' && component.format === 'DOCUMENT' && documentUrl) {
      components.push({
        type: 'header',
        parameters: [
          {
            type: 'document',
            document: { link: documentUrl, filename: documentFilename ?? 'document.pdf' },
          },
        ],
      });
    } else if (component.type === 'BODY') {
      // Extract parameter count from template text ({{1}}, {{2}}, etc.)
      const paramMatches = component.text?.match(/\{\{\d+\}\}/g) ?? [];
      const bodyParams = paramMatches.map((_, index) => ({
        type: 'text' as const,
        text: params[index] ?? '',
      }));

      if (bodyParams.length > 0) {
        components.push({
          type: 'body',
          parameters: bodyParams,
        });
      }
    } else if (component.type === 'BUTTONS' && component.buttons) {
      component.buttons.forEach((button, index) => {
        if (button.type === 'URL' && button.url?.startsWith('{{')) {
          const paramIndex = parseInt(button.url.replace(/[{}]/g, ''), 10) - 1;
          components.push({
            type: `button`,
            parameters: [
              {
                type: 'text',
                text: params[paramIndex] ?? '',
              },
            ],
          });
          // Note: WhatsApp API uses sub_type and index for button components
          // This is simplified; real implementation needs:
          // { type: 'button', sub_type: 'url', index, parameters: [...] }
          void index;
        }
      });
    }
  }

  return {
    messaging_product: 'whatsapp',
    to: recipientPhone,
    type: 'template',
    template: {
      name: template.name,
      language: { code: languageCode },
      components,
    },
  };
}
