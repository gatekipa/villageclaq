export function generateWhatsAppMessage(shareUrl: string, language: 'en' | 'fr' = 'en'): string {
  // Sanitize the URL to ensure no additional query params are injected
  let cleanUrl = shareUrl;
  try {
    const urlObj = new URL(shareUrl);
    const token = urlObj.searchParams.get('ref');
    if (token) {
      cleanUrl = `${urlObj.origin}${urlObj.pathname}?ref=${token}`;
    }
  } catch (e) {
    // Fallback if not a valid URL object
    cleanUrl = shareUrl.split('?ref=')[0] + '?ref=' + (shareUrl.split('?ref=')[1]?.split('&')[0] || '');
  }

  let text = '';
  if (language === 'fr') {
    text = `Rejoignez-nous sur VillageClaq pour gérer notre organisation de manière transparente et sécurisée. Cliquez ici pour commencer : ${cleanUrl}`;
  } else {
    text = `Join us on VillageClaq to manage our organization transparently and securely. Click here to get started: ${cleanUrl}`;
  }

  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function generateSmsMessage(shareUrl: string, language: 'en' | 'fr' = 'en'): string {
  let cleanUrl = shareUrl;
  try {
    const urlObj = new URL(shareUrl);
    const token = urlObj.searchParams.get('ref');
    if (token) {
      cleanUrl = `${urlObj.origin}${urlObj.pathname}?ref=${token}`;
    }
  } catch (e) {
    cleanUrl = shareUrl.split('?ref=')[0] + '?ref=' + (shareUrl.split('?ref=')[1]?.split('&')[0] || '');
  }

  if (language === 'fr') {
    return `Rejoignez notre groupe sur VillageClaq : ${cleanUrl}`;
  } else {
    return `Join our group on VillageClaq: ${cleanUrl}`;
  }
}
