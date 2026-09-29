import Image from "next/image";
import { Newsreader, Hanken_Grotesk } from "next/font/google";
import { ArrowRight, Check, Globe2, UsersRound, WalletCards, CalendarDays, FileText, ShieldCheck, Vote } from "lucide-react";
import { Link, routing } from "@/i18n/routing";
import "./landing.css";

const serif = Newsreader({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--vc-serif", display: "swap" });
const sans = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--vc-sans", display: "swap" });

const copy = {
  en: {
    features: "What it brings together", featureTitle: "Everything your group needs to stay in step.", product: "Inside VillageClaq", signIn: "Founder sign in",
    eyebrow: "For groups that look after their people", title: "Run your group with clarity, from the first member to the final decision.",
    intro: "Keep membership, contributions, hosting, meeting minutes and governance together—so officers can spend less time chasing records and more time moving the group forward.",
    explore: "Explore the product", preview: "Founder preview · access provided to invited testers", illustrative: "Illustrative data",
    heroLabel: "Published meeting minutes in VillageClaq", who: "One home for the work behind a thriving group",
    whoBody: "Built for alumni associations, community organizations, savings circles and other member-led groups.",
    people: "Bring everyone in", peopleBody: "Add members manually or from CSV and Excel files. People can take part before activating an online account.",
    money: "Track contributions", moneyBody: "Record obligations and payments with a clear history and controls that respect each group’s scope.",
    visibility: "Share the right numbers", visibilityBody: "Let members see permitted posted financial totals without exposing private ledger details.",
    hostingFeature: "Keep hosting organized", hostingFeatureBody: "Assign hosts, see upcoming turns and retain the record of completed meetings.",
    minutes: "Keep decisions findable", minutesBody: "Write meeting minutes, control member visibility and publish official revisions.",
    governance: "Govern with confidence", governanceBody: "Use role-scoped permissions, bylaws and election tools to support accountable decisions.",
    storyEyebrow: "Real product screens", storyTitle: "A clearer view of everyday group work.",
    storyBody: "These screens come from the current application using fictional records. Each shows a working part of the founder preview.",
    importLabel: "01 / Membership", importTitle: "Welcome people on your terms.", importBody: "Officers can use a spreadsheet or enter a member directly. An online account is optional; membership and history stay with the person.",
    financeLabel: "02 / Financial visibility", financeTitle: "Make progress visible without oversharing.", financeBody: "When an executive enables it, members get a read-only summary of posted totals for their group.",
    hostingLabel: "03 / Hosting", hostingTitle: "Know whose turn is next.", hostingBody: "A shared roster keeps assignments and hosting history in one place.",
    fullImage: "View full image", howEyebrow: "Getting started", howTitle: "Set up a group, then build a dependable record.",
    step1: "Create your group", step1Body: "Set up the group and its officers, then choose the rules that fit its work.",
    step2: "Add your members", step2Body: "Enter people directly or import a spreadsheet; invite account activation when they are ready.",
    step3: "Run the work", step3Body: "Track contributions and hosting, capture minutes, and share permitted information.",
    finalTitle: "Ready to explore VillageClaq?", finalBody: "This site is available for founder testing with fictional data. Sign in with an account supplied for the preview.",
    footerText: "Group work, made clearer.", about: "About", contact: "Contact", privacy: "Privacy", terms: "Terms", founderNote: "Founder test environment · fictional data only",
  },
  fr: {
    features: "Ce qui se rassemble", featureTitle: "Tout ce qu’il faut pour avancer ensemble.", product: "Dans VillageClaq", signIn: "Connexion au test fondateur",
    eyebrow: "Pour les groupes qui prennent soin de leurs membres", title: "Gérez votre groupe avec clarté, du premier membre à la dernière décision.",
    intro: "Réunissez les adhésions, les cotisations, l’accueil des réunions, les procès-verbaux et la gouvernance. Les responsables passent moins de temps à chercher des dossiers et davantage à faire avancer le groupe.",
    explore: "Découvrir le produit", preview: "Aperçu fondateur · accès réservé aux personnes invitées", illustrative: "Données illustratives",
    heroLabel: "Procès-verbal publié dans VillageClaq", who: "Un seul espace pour faire vivre votre groupe",
    whoBody: "Pensé pour les associations d’anciens, les organisations communautaires, les cercles d’épargne et les autres groupes animés par leurs membres.",
    people: "Accueillir chaque membre", peopleBody: "Ajoutez des membres manuellement ou depuis un fichier CSV ou Excel. Ils peuvent participer avant d’activer un compte en ligne.",
    money: "Suivre les cotisations", moneyBody: "Enregistrez les obligations et les paiements avec un historique clair et des contrôles propres à chaque groupe.",
    visibility: "Partager les bons chiffres", visibilityBody: "Donnez accès aux totaux financiers publiés et autorisés sans exposer les détails privés du grand livre.",
    hostingFeature: "Organiser l’accueil", hostingFeatureBody: "Désignez les hôtes, voyez les prochains tours et conservez l’historique des réunions.",
    minutes: "Retrouver les décisions", minutesBody: "Rédigez les procès-verbaux, contrôlez leur visibilité et publiez des révisions officielles.",
    governance: "Gouverner avec confiance", governanceBody: "Appuyez vos décisions sur des droits par rôle, des statuts et des outils d’élection.",
    storyEyebrow: "Vraies captures du produit", storyTitle: "Le travail quotidien du groupe, plus lisible.",
    storyBody: "Ces écrans proviennent de l’application actuelle et utilisent des données fictives. Chacun montre une fonction de l’aperçu fondateur.",
    importLabel: "01 / Adhésion", importTitle: "Accueillez chacun à son rythme.", importBody: "Les responsables peuvent importer un fichier ou saisir un membre. Le compte en ligne reste facultatif et l’historique suit la personne.",
    financeLabel: "02 / Visibilité financière", financeTitle: "Montrer les progrès sans trop divulguer.", financeBody: "Quand un responsable l’active, les membres voient en lecture seule les totaux comptabilisés de leur groupe.",
    hostingLabel: "03 / Accueil", hostingTitle: "Sachez à qui vient le tour.", hostingBody: "Un calendrier commun rassemble les affectations et l’historique d’accueil.",
    fullImage: "Voir l’image entière", howEyebrow: "Pour commencer", howTitle: "Créez un groupe, puis bâtissez un historique fiable.",
    step1: "Créez votre groupe", step1Body: "Définissez le groupe, ses responsables et les règles adaptées à son activité.",
    step2: "Ajoutez les membres", step2Body: "Saisissez les personnes ou importez un fichier, puis invitez-les à activer leur compte lorsqu’elles le souhaitent.",
    step3: "Suivez l’activité", step3Body: "Gérez les cotisations et l’accueil, consignez les décisions et partagez les informations autorisées.",
    finalTitle: "Envie de découvrir VillageClaq ?", finalBody: "Ce site est ouvert aux tests fondateurs avec des données fictives. Connectez-vous avec un compte fourni pour l’aperçu.",
    footerText: "Le travail du groupe, en plus clair.", about: "À propos", contact: "Contact", privacy: "Confidentialité", terms: "Conditions", founderNote: "Environnement de test fondateur · données fictives uniquement",
  },
} as const;

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const c = locale === "fr" ? copy.fr : copy.en;
  const otherLocale = routing.locales.find((l) => l !== locale) ?? "fr";
  const outcomes = [
    { icon: UsersRound, title: c.people, body: c.peopleBody },
    { icon: WalletCards, title: c.money, body: c.moneyBody },
    { icon: ShieldCheck, title: c.visibility, body: c.visibilityBody },
    { icon: CalendarDays, title: c.hostingFeature, body: c.hostingFeatureBody },
    { icon: FileText, title: c.minutes, body: c.minutesBody },
    { icon: Vote, title: c.governance, body: c.governanceBody },
  ];
  const steps = [
    { title: c.step1, body: c.step1Body },
    { title: c.step2, body: c.step2Body },
    { title: c.step3, body: c.step3Body },
  ];
  return (
    <div className={`vc-landing ${serif.variable} ${sans.variable}`}>
      <header className="vc-nav">
        <nav className="vc-nav-inner" aria-label="VillageClaq">
          <a href="#top" className="vc-nav-brand"><Image src="/logo-mark.svg" alt="" width={32} height={32} /><span>VillageClaq</span></a>
          <div className="vc-nav-links"><a href="#features">{c.features}</a><a href="#product">{c.product}</a></div>
          <div className="vc-nav-actions">
            <Link href="/" locale={otherLocale} className="vc-lang" aria-label={otherLocale === "fr" ? "Français" : "English"}><Globe2 size={16} />{otherLocale.toUpperCase()}</Link>
            <Link href="/login" className="vc-login">{c.signIn}</Link>
          </div>
        </nav>
      </header>
      <main id="top">
        <section className="vc-hero">
          <div className="vc-hero-inner">
            <div className="vc-hero-copy">
              <span className="vc-eyebrow vc-eyebrow-light">{c.eyebrow}</span>
              <h1>{c.title}</h1>
              <p className="vc-hero-intro">{c.intro}</p>
              <div className="vc-actions"><a className="vc-button vc-button-light" href="#product">{c.explore}<ArrowRight size={18} /></a><Link className="vc-button vc-button-outline" href="/login">{c.signIn}</Link></div>
              <p className="vc-preview-note"><Check size={16} />{c.preview}</p>
            </div>
            <figure className="vc-hero-visual">
              <div className="vc-screen-top"><span className="vc-screen-dot" /><span className="vc-screen-dot" /><span className="vc-screen-dot" /><span>{c.heroLabel}</span></div>
              <Image src="/images/product/minutes.webp" width={1288} height={570} alt={c.heroLabel} priority sizes="(max-width: 760px) 720px, (max-width: 1100px) 55vw, 680px" />
              <figcaption>{c.illustrative} · <a href="/images/product/minutes.webp" target="_blank" rel="noopener noreferrer">{c.fullImage}</a></figcaption>
            </figure>
          </div>
        </section>
        <section className="vc-intro-strip"><div className="vc-container"><h2>{c.who}</h2><p>{c.whoBody}</p></div></section>
        <section className="vc-section" id="features"><div className="vc-container"><span className="vc-eyebrow">{c.features}</span><h2 className="vc-section-title">{c.featureTitle}</h2><div className="vc-outcomes">{outcomes.map(({ icon: Icon, title, body }) => <article className="vc-outcome" key={title}><div className="vc-icon"><Icon size={23} strokeWidth={1.8} /></div><h3>{title}</h3><p>{body}</p></article>)}</div></div></section>
        <section className="vc-section vc-product" id="product"><div className="vc-container"><span className="vc-eyebrow">{c.storyEyebrow}</span><h2 className="vc-section-title">{c.storyTitle}</h2><p className="vc-section-sub">{c.storyBody}</p>
          <div className="vc-story-list">
            <article className="vc-story"><div className="vc-story-copy"><span className="vc-story-number">{c.importLabel}</span><h3>{c.importTitle}</h3><p>{c.importBody}</p></div><figure className="vc-image-card"><Image src="/images/product/import.webp" width={718} height={345} alt={c.peopleBody} sizes="(max-width: 760px) 100vw, 48vw" /><figcaption>{c.illustrative} · <a href="/images/product/import.webp" target="_blank" rel="noopener noreferrer">{c.fullImage}</a></figcaption></figure></article>
            <article className="vc-story"><div className="vc-story-copy"><span className="vc-story-number">{c.financeLabel}</span><h3>{c.financeTitle}</h3><p>{c.financeBody}</p></div><figure className="vc-image-card vc-finance-image"><Image src="/images/product/summary.webp" width={425} height={337} alt={c.visibilityBody} sizes="(max-width: 760px) 100vw, 425px" /><figcaption>{c.illustrative} · <a href="/images/product/summary.webp" target="_blank" rel="noopener noreferrer">{c.fullImage}</a></figcaption></figure></article>
            <article className="vc-story"><div className="vc-story-copy"><span className="vc-story-number">{c.hostingLabel}</span><h3>{c.hostingTitle}</h3><p>{c.hostingBody}</p></div><figure className="vc-image-card"><Image src="/images/product/hosting.webp" width={715} height={335} alt={c.hostingBody} sizes="(max-width: 760px) 570px, 48vw" /><figcaption>{c.illustrative} · <a href="/images/product/hosting.webp" target="_blank" rel="noopener noreferrer">{c.fullImage}</a></figcaption></figure></article>
          </div>
        </div></section>
        <section className="vc-section vc-how"><div className="vc-container"><span className="vc-eyebrow">{c.howEyebrow}</span><h2 className="vc-section-title">{c.howTitle}</h2><div className="vc-steps">{steps.map((step, index) => <article className="vc-step" key={step.title}><span>0{index + 1}</span><h3>{step.title}</h3><p>{step.body}</p></article>)}</div></div></section>
        <section className="vc-final"><div className="vc-container"><h2>{c.finalTitle}</h2><p>{c.finalBody}</p><Link className="vc-button vc-button-light" href="/login">{c.signIn}<ArrowRight size={18} /></Link></div></section>
      </main>
      <footer className="vc-footer"><div className="vc-container"><div className="vc-footer-top"><div><span className="vc-footer-brand">VillageClaq</span><p>{c.footerText}</p></div><div className="vc-footer-links"><Link href="/about">{c.about}</Link><Link href="/contact">{c.contact}</Link><Link href="/privacy">{c.privacy}</Link><Link href="/terms">{c.terms}</Link></div></div><p className="vc-footer-note">{c.founderNote}</p></div></footer>
    </div>
  );
}
