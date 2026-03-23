/**
 * Welcome Email Flow — automated drip sequence for new users
 *
 * These are email template functions that generate the content.
 * Actual sending is handled by the notification service (Resend/SendGrid).
 *
 * Flow:
 * - Signup (Day 0): Welcome email with "Get Started" CTA
 * - Day 1: "Complete your profile" if profile incomplete
 * - Day 3: "Create your first group" if no group created
 * - Day 7: "How's it going?" check-in
 * - Day 14: "We miss you" re-engagement if inactive
 */

interface WelcomeEmailData {
  userName: string;
  locale: "en" | "fr";
  appUrl: string;
}

export function getWelcomeEmail({ userName, locale, appUrl }: WelcomeEmailData) {
  if (locale === "fr") {
    return {
      subject: `Bienvenue sur VillageClaq, ${userName} !`,
      body: `Bonjour ${userName},\n\nBienvenue sur VillageClaq — la plateforme de gestion pour les groupes communautaires africains.\n\nCommencez en créant votre premier groupe ou en rejoignant un groupe existant.\n\n${appUrl}/dashboard\n\nÀ bientôt,\nL'équipe VillageClaq`,
    };
  }
  return {
    subject: `Welcome to VillageClaq, ${userName}!`,
    body: `Hi ${userName},\n\nWelcome to VillageClaq — the management platform for African community groups.\n\nGet started by creating your first group or joining an existing one.\n\n${appUrl}/dashboard\n\nBest,\nThe VillageClaq Team`,
  };
}

export function getCompleteProfileEmail({ userName, locale, appUrl }: WelcomeEmailData) {
  if (locale === "fr") {
    return {
      subject: `${userName}, complétez votre profil sur VillageClaq`,
      body: `Bonjour ${userName},\n\nVotre profil VillageClaq n'est pas encore complet. Ajoutez votre photo, numéro de téléphone et bio pour aider les membres de votre groupe à vous reconnaître.\n\n${appUrl}/dashboard/my-profile\n\nL'équipe VillageClaq`,
    };
  }
  return {
    subject: `${userName}, complete your VillageClaq profile`,
    body: `Hi ${userName},\n\nYour VillageClaq profile isn't complete yet. Add your photo, phone number, and bio to help your group members recognize you.\n\n${appUrl}/dashboard/my-profile\n\nThe VillageClaq Team`,
  };
}

export function getCreateGroupEmail({ userName, locale, appUrl }: WelcomeEmailData) {
  if (locale === "fr") {
    return {
      subject: `${userName}, créez votre premier groupe sur VillageClaq`,
      body: `Bonjour ${userName},\n\nVous n'avez pas encore créé de groupe. VillageClaq vous permet de gérer les cotisations, les présences, les réunions et bien plus pour votre communauté.\n\nCréez votre groupe en 30 secondes :\n${appUrl}/dashboard/onboarding/group\n\nL'équipe VillageClaq`,
    };
  }
  return {
    subject: `${userName}, create your first group on VillageClaq`,
    body: `Hi ${userName},\n\nYou haven't created a group yet. VillageClaq lets you manage contributions, attendance, meetings, and more for your community.\n\nCreate your group in 30 seconds:\n${appUrl}/dashboard/onboarding/group\n\nThe VillageClaq Team`,
  };
}

export function getCheckinEmail({ userName, locale, appUrl }: WelcomeEmailData) {
  if (locale === "fr") {
    return {
      subject: `${userName}, comment ça se passe avec VillageClaq ?`,
      body: `Bonjour ${userName},\n\nCela fait une semaine que vous avez rejoint VillageClaq ! Tout se passe bien ? N'hésitez pas à nous contacter si vous avez des questions.\n\n${appUrl}/dashboard\n\nL'équipe VillageClaq`,
    };
  }
  return {
    subject: `${userName}, how's it going with VillageClaq?`,
    body: `Hi ${userName},\n\nIt's been a week since you joined VillageClaq! How's everything going? Don't hesitate to reach out if you have any questions.\n\n${appUrl}/dashboard\n\nThe VillageClaq Team`,
  };
}

export function getReengagementEmail({ userName, locale, appUrl }: WelcomeEmailData) {
  if (locale === "fr") {
    return {
      subject: `${userName}, vous nous manquez sur VillageClaq`,
      body: `Bonjour ${userName},\n\nNous avons remarqué que vous ne vous êtes pas connecté depuis un moment. Votre communauté vous attend !\n\nRevenez voir les dernières nouvelles :\n${appUrl}/dashboard\n\nL'équipe VillageClaq`,
    };
  }
  return {
    subject: `${userName}, we miss you on VillageClaq`,
    body: `Hi ${userName},\n\nWe noticed you haven't logged in for a while. Your community is waiting for you!\n\nCome back and see what's new:\n${appUrl}/dashboard\n\nThe VillageClaq Team`,
  };
}
