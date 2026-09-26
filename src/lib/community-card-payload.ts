export interface ValidatedCardPayload {
  organizationName: string;
  memberDisplayName: string;
  issuedAt: string;
  cardType: string;
}

export function sanitizePublicCardPayload(rawPayload: any, language: 'en' | 'fr' = 'en'): ValidatedCardPayload | null {
  if (!rawPayload || typeof rawPayload !== 'object') return null;
  if (rawPayload.valid === false) return null;

  // Strict allowlist filtering (NO PII keys passed through)
  const organizationName = typeof rawPayload.organization_name === 'string' 
    ? rawPayload.organization_name 
    : (language === 'fr' ? 'Organisation inconnue' : 'Unknown Organization');
    
  const memberDisplayName = typeof rawPayload.member_display_name === 'string' 
    ? rawPayload.member_display_name 
    : (language === 'fr' ? 'Membre' : 'Member');
  
  let issuedAt = new Date().toISOString();
  if (typeof rawPayload.issued_at === 'string' && !isNaN(Date.parse(rawPayload.issued_at))) {
    issuedAt = rawPayload.issued_at;
  }

  const allowedTypes = ['membership_card', 'election_success', 'milestone_achievement'];
  const cardType = allowedTypes.includes(rawPayload.card_type) ? rawPayload.card_type : 'membership_card';

  return {
    organizationName,
    memberDisplayName,
    issuedAt,
    cardType
  };
}
