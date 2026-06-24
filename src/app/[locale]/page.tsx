import { getTranslations } from "next-intl/server";
import { Newsreader, Hanken_Grotesk } from "next/font/google";
import { Link, routing } from "@/i18n/routing";
import {
  Globe, ArrowRight, Check, LayoutGrid, Users, CircleDollarSign, Calendar,
  LineChart, Search, Bell, Receipt, FileText, Home, Shield, Send, Lock,
  CalendarCheck, BarChart3, RefreshCw, Vote, IdCard, Columns3, Languages,
  Star, ChevronDown,
} from "lucide-react";
import "./landing.css";

// Bespoke marketing typefaces — exposed as CSS variables and scoped to the
// landing wrapper (.vc-landing) so they never touch the emerald/slate app.
const serif = Newsreader({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--vc-serif", display: "swap" });
const sans = Hanken_Grotesk({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--vc-sans", display: "swap" });

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations("landing");
  const otherLocale = routing.locales.find((l) => l !== locale) ?? "fr";

  const problems = [
    { icon: Receipt, k: "money" },
    { icon: FileText, k: "paper" },
    { icon: Home, k: "hosting" },
    { icon: Shield, k: "officers" },
  ];
  const featureCards = [
    { icon: Users, k: "members" },
    { icon: CalendarCheck, k: "minutes" },
    { icon: Bell, k: "events" },
    { icon: BarChart3, k: "reports" },
    { icon: RefreshCw, k: "savings" },
    { icon: Vote, k: "elections" },
    { icon: IdCard, k: "cards" },
    { icon: Columns3, k: "vault" },
    { icon: Languages, k: "bilingual" },
  ];
  const countries = ["CM", "NG", "GH", "KE", "ZA", "UG", "SN", "US", "GB", "CA", "FR"];
  const steps = ["create", "invite", "track"];
  const testimonials = ["adebayo", "kwame", "wanjiku", "thabo"];
  const tiers = [
    { k: "free", featured: false, cta: "outline" },
    { k: "starter", featured: false, cta: "muted" },
    { k: "pro", featured: true, cta: "solid" },
    { k: "enterprise", featured: false, cta: "outline" },
  ];
  const tierFeatures: Record<string, number> = { free: 5, starter: 5, pro: 6, enterprise: 5 };
  const faqs = ["groups", "french", "smartphones", "secure", "free", "currencies"];

  return (
    <div className={`vc-landing ${serif.variable} ${sans.variable}`}>
      {/* ============ NAV ============ */}
      <header className="vc-nav">
        <nav className="vc-nav-inner">
          <a href="#top" className="vc-nav-brand">
            <img src="/logo-mark.svg" alt="VillageClaq" width={30} height={30} />
            <span>VillageClaq</span>
          </a>
          <div className="vc-nav-links">
            <a href="#features">{t("nav.features")}</a>
            <a href="#how">{t("nav.how")}</a>
            <a href="#pricing">{t("nav.pricing")}</a>
            <a href="#faq">{t("nav.faq")}</a>
          </div>
          <div className="vc-nav-actions">
            <Link href="/" locale={otherLocale} className="vc-lang" aria-label={t("nav.switchLanguage")}>
              <Globe size={15} strokeWidth={1.7} />{otherLocale.toUpperCase()}
            </Link>
            <Link href="/login" className="vc-login">{t("nav.login")}</Link>
            <Link href="/signup" className="vc-nav-cta">{t("nav.getStarted")}</Link>
          </div>
        </nav>
      </header>

      {/* ============ HERO ============ */}
      <section id="top" className="vc-hero">
        <div className="vc-hero-grid-bg" />
        <div className="vc-hero-glow" />
        <div className="vc-hero-inner">
          <div>
            <span className="vc-hero-badge"><Globe size={14} strokeWidth={1.8} style={{ color: "var(--mint)" }} />{t("hero.badge")}</span>
            <h1 className="vc-hero-h1">{t("hero.h1a")}<br /><span className="accent">{t("hero.h1b")}</span></h1>
            <p className="vc-hero-sub">{t("hero.sub")}</p>
            <div className="vc-hero-actions">
              <Link href="/signup" className="vc-btn-light">{t("hero.startFree")}<ArrowRight size={17} strokeWidth={2} /></Link>
              <a href="#how" className="vc-btn-ghost">{t("hero.bookDemo")}</a>
            </div>
            <div className="vc-hero-trust">
              <span><Check size={16} strokeWidth={2.2} style={{ color: "var(--mint)" }} />{t("hero.trust1")}</span>
              <span><Check size={16} strokeWidth={2.2} style={{ color: "var(--mint)" }} />{t("hero.trust2")}</span>
            </div>
          </div>

          {/* product dashboard mockup (illustrative) */}
          <div className="vc-glow-wrap">
            <div className="vc-mock">
              <aside className="vc-mock-aside">
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px 14px" }}>
                  <img src="/logo-mark.svg" alt="" width={22} height={22} />
                  <span style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: 15, color: "var(--ink)" }}>VillageClaq</span>
                </div>
                <div className="vc-mock-navitem active"><LayoutGrid size={16} strokeWidth={1.8} />{t("nav.dashboard")}</div>
                <div className="vc-mock-navitem"><Users size={16} strokeWidth={1.7} />{t("nav.members")}</div>
                <div className="vc-mock-navitem"><CircleDollarSign size={16} strokeWidth={1.7} />{t("nav.contributions")}</div>
                <div className="vc-mock-navitem"><Calendar size={16} strokeWidth={1.7} />{t("nav.meetings")}</div>
                <div className="vc-mock-navitem"><LineChart size={16} strokeWidth={1.7} />{t("nav.reports")}</div>
                <div style={{ marginTop: "auto", background: "linear-gradient(160deg,#0E5C40,#0A3528)", borderRadius: 11, padding: 12, color: "#dff5ec" }}>
                  <div style={{ fontSize: 11.5, fontWeight: 600, color: "var(--mint)" }}>{t("mock.proTrial")}</div>
                  <div style={{ fontSize: 11, color: "rgba(223,245,236,.7)", margin: "3px 0 8px" }}>{t("mock.daysLeft")}</div>
                  <div style={{ fontSize: 11.5, fontWeight: 600, background: "#fff", color: "var(--green-darker)", textAlign: "center", padding: 6, borderRadius: 7 }}>{t("mock.upgrade")}</div>
                </div>
              </aside>
              <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid #ECEBE4" }}>
                  <div>
                    <div style={{ fontFamily: "var(--serif)", fontSize: 16, fontWeight: 600, color: "var(--ink)" }}>Bamenda Alumni Union</div>
                    <div style={{ fontSize: 11.5, color: "#8A958D" }}>{t("mock.groupMeta")}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 30, height: 30, borderRadius: "50%", background: "#EDECE4", display: "flex", alignItems: "center", justifyContent: "center" }}><Search size={15} strokeWidth={1.8} style={{ color: "#7A857E" }} /></span>
                    <span style={{ width: 30, height: 30, borderRadius: "50%", background: "#EDECE4", display: "flex", alignItems: "center", justifyContent: "center" }}><Bell size={15} strokeWidth={1.8} style={{ color: "#7A857E" }} /></span>
                    <span style={{ width: 30, height: 30, borderRadius: "50%", background: "var(--accent)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>CN</span>
                  </div>
                </div>
                <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(108px,1fr))", gap: 10 }}>
                    <div className="vc-kpi"><div className="vc-kpi-label">{t("mock.kpiMembers")}</div><div className="vc-kpi-val">247</div><div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>{t("mock.kpiMembersDelta")}</div></div>
                    <div className="vc-kpi"><div className="vc-kpi-label">{t("mock.kpiBalance")}</div><div className="vc-kpi-val">$18.4K</div><div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>{t("mock.kpiBalanceDelta")}</div></div>
                    <div className="vc-kpi"><div className="vc-kpi-label">{t("mock.kpiCollected")}</div><div className="vc-kpi-val">94%</div><div style={{ fontSize: 11, color: "var(--accent)", fontWeight: 600 }}>{t("mock.kpiOnTrack")}</div></div>
                    <div className="vc-kpi"><div className="vc-kpi-label">{t("mock.kpiMeetings")}</div><div className="vc-kpi-val">12</div><div style={{ fontSize: 11, color: "#9AA49C", fontWeight: 600 }}>{t("mock.kpiThisYear")}</div></div>
                  </div>
                  <div style={{ border: "1px solid #ECEBE4", borderRadius: 12, padding: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{t("mock.collectionTitle")}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "var(--accent-strong)" }}>94%</span>
                    </div>
                    {[
                      { n: "Aisha Mballa", i: "AM", paid: true },
                      { n: "Emeka Okafor", i: "EO", paid: true },
                      { n: "Fatou Diop", i: "FD", paid: false },
                    ].map((m) => (
                      <div key={m.i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 0", borderTop: "1px solid #F0EFE8" }}>
                        <span style={{ width: 24, height: 24, borderRadius: "50%", background: m.paid ? "#EAF2EE" : "#F6EFDD", color: m.paid ? "var(--accent-strong)" : "#9A6B12", fontSize: 9, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{m.i}</span>
                        <span style={{ fontSize: 13, color: "var(--ink)" }}>{m.n}</span>
                        <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 700, color: m.paid ? "#137A52" : "#9A6B12", background: m.paid ? "#E2F3EB" : "#F8EED6", padding: "3px 9px", borderRadius: 20 }}>{m.paid ? t("mock.paid") : t("mock.pending")}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============ METRICS BAND ============ */}
      <section className="vc-metrics">
        <div className="vc-metrics-inner">
          {(["groups", "members", "tracked", "countries"] as const).map((k) => (
            <div key={k} className="vc-metric">
              <div className="vc-metric-num">{t(`metrics.${k}Num`)}</div>
              <div className="vc-metric-label">{t(`metrics.${k}Label`)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ============ PROBLEM -> SOLUTION ============ */}
      <section className="vc-section">
        <div className="vc-split">
          <div style={{ flex: "1 1 320px", maxWidth: 420 }}>
            <div className="vc-eyebrow">{t("problem.eyebrow")}</div>
            <h2 className="vc-h2">{t("problem.title")}</h2>
            <p className="vc-lead">{t("problem.lead")}</p>
            <div style={{ marginTop: 26, display: "inline-flex", alignItems: "center", gap: 10, fontSize: 14, fontWeight: 600, color: "var(--accent-strong)" }}>
              <span style={{ width: 34, height: 1, background: "var(--accent)" }} />{t("problem.tag")}
            </div>
          </div>
          <div style={{ flex: "2 1 460px", minWidth: 0 }}>
            {problems.map(({ icon: Icon, k }) => (
              <div key={k} className="vc-problem-row">
                <div className="vc-problem-icon"><Icon size={21} strokeWidth={1.7} /></div>
                <div>
                  <h3 className="vc-problem-h3">{t(`problem.${k}.title`)}</h3>
                  <p className="vc-problem-p">{t(`problem.${k}.desc`)}</p>
                  <div className="vc-problem-fix"><Check size={17} strokeWidth={2.2} />{t(`problem.${k}.fix`)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FEATURES ============ */}
      <section id="features" className="vc-section vc-features">
        <div className="vc-wrap">
          <div style={{ maxWidth: 680 }}>
            <div className="vc-eyebrow">{t("features.eyebrow")}</div>
            <h2 className="vc-h2">{t("features.title")}</h2>
            <p className="vc-lead">{t("features.lead")}</p>
          </div>

          {/* spotlight 1 */}
          <div className="vc-spotlight" style={{ marginTop: 64 }}>
            <div style={{ flex: "1 1 360px", maxWidth: 480 }}>
              <div className="vc-eyebrow" style={{ letterSpacing: ".1em" }}>{t("spot1.eyebrow")}</div>
              <h3 className="vc-h2" style={{ fontSize: "clamp(27px,3vw,36px)", lineHeight: 1.1 }}>{t("spot1.title")}</h3>
              <p style={{ fontSize: 16, lineHeight: 1.65, color: "var(--ink-soft)", marginTop: 16 }}>{t("spot1.desc")}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 13, marginTop: 22 }}>
                {["a", "b", "c"].map((i) => (
                  <div key={i} className="vc-feat-check"><Check size={18} strokeWidth={2.2} style={{ color: "var(--accent)" }} />{t(`spot1.check.${i}`)}</div>
                ))}
              </div>
            </div>
            <div style={{ flex: "1 1 400px", minWidth: 0 }}>
              <div style={{ background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 16, padding: 22, boxShadow: "0 26px 50px -34px rgba(10,53,40,.4)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontFamily: "var(--serif)", fontSize: 17, fontWeight: 600, color: "var(--ink)" }}>{t("spot1.cardTitle")}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent-strong)", background: "var(--accent-soft)", padding: "4px 10px", borderRadius: 20 }}>{t("spot1.collected")}</span>
                </div>
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontFamily: "var(--serif)", fontSize: 32, fontWeight: 600, color: "var(--ink)", letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums" }}>$11,750</span>
                    <span style={{ fontSize: 13, color: "var(--ink-faint)" }}>{t("spot1.of")} $12,500</span>
                  </div>
                  <div style={{ height: 8, borderRadius: 20, background: "#E6E4DA", marginTop: 12, overflow: "hidden" }}><div style={{ width: "94%", height: "100%", background: "linear-gradient(90deg,var(--accent),#2BB179)", borderRadius: 20 }} /></div>
                </div>
                <div style={{ marginTop: 18 }}>
                  {[
                    { n: "Aisha Mballa", i: "AM", amt: "$50", paid: true },
                    { n: "Emeka Okafor", i: "EO", amt: "$50", paid: true },
                    { n: "Fatou Diop", i: "FD", amt: "$50", paid: false },
                  ].map((m) => (
                    <div key={m.i} style={{ display: "flex", alignItems: "center", gap: 11, padding: "10px 0", borderTop: "1px solid var(--line)" }}>
                      <span style={{ width: 26, height: 26, borderRadius: "50%", background: m.paid ? "#EAF2EE" : "#F6EFDD", color: m.paid ? "var(--accent-strong)" : "#9A6B12", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{m.i}</span>
                      <span style={{ fontSize: 14, color: "var(--ink)" }}>{m.n}</span>
                      <span style={{ marginLeft: "auto", fontSize: 14, fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>{m.amt}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: m.paid ? "#137A52" : "#9A6B12", background: m.paid ? "#E2F3EB" : "#F8EED6", padding: "3px 9px", borderRadius: 20 }}>{m.paid ? t("mock.paid") : t("mock.pending")}</span>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 9, fontSize: 13, color: "var(--accent-strong)", background: "var(--accent-soft)", padding: "10px 13px", borderRadius: 10 }}><Send size={16} strokeWidth={1.9} />{t("spot1.reminder")}</div>
              </div>
            </div>
          </div>

          {/* spotlight 2 */}
          <div className="vc-spotlight" style={{ marginTop: 72 }}>
            <div style={{ flex: "1 1 400px", minWidth: 0, order: 1 }}>
              <div style={{ background: "linear-gradient(165deg,#0E5C40,#0A3528)", borderRadius: 16, padding: 24, color: "#dff5ec", boxShadow: "0 28px 56px -30px rgba(10,53,40,.65)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, color: "rgba(223,245,236,.7)" }}>{t("spot2.agm")}</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 700, color: "var(--green-darker)", background: "var(--mint)", padding: "4px 10px", borderRadius: 20 }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--green-darker)" }} />{t("spot2.live")}</span>
                </div>
                <div style={{ marginTop: 14, fontFamily: "var(--serif)", fontSize: 28, fontWeight: 600, letterSpacing: "-.02em", color: "#fff" }}>{t("spot2.election")}</div>
                <div style={{ fontSize: 13, color: "rgba(223,245,236,.7)", marginTop: 2 }}>{t("spot2.voted")}</div>
                <div style={{ marginTop: 22, display: "flex", flexDirection: "column", gap: 16 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5, marginBottom: 7 }}><span style={{ color: "#fff", fontWeight: 600 }}>Ngozi Achu</span><span style={{ color: "var(--mint)", fontWeight: 700 }}>61%</span></div>
                    <div style={{ height: 9, borderRadius: 20, background: "rgba(255,255,255,.12)", overflow: "hidden" }}><div style={{ width: "61%", height: "100%", background: "var(--mint)", borderRadius: 20 }} /></div>
                  </div>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13.5, marginBottom: 7 }}><span style={{ color: "#dff5ec" }}>Samuel Tabi</span><span style={{ color: "rgba(223,245,236,.75)", fontWeight: 700 }}>39%</span></div>
                    <div style={{ height: 9, borderRadius: 20, background: "rgba(255,255,255,.12)", overflow: "hidden" }}><div style={{ width: "39%", height: "100%", background: "rgba(116,236,200,.5)", borderRadius: 20 }} /></div>
                  </div>
                </div>
                <div style={{ marginTop: 20, display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "rgba(223,245,236,.6)", borderTop: "1px solid rgba(255,255,255,.1)", paddingTop: 14 }}><Lock size={14} strokeWidth={1.8} />{t("spot2.ballot")}</div>
              </div>
            </div>
            <div style={{ flex: "1 1 360px", maxWidth: 480, order: 2 }}>
              <div className="vc-eyebrow" style={{ letterSpacing: ".1em" }}>{t("spot2.eyebrow")}</div>
              <h3 className="vc-h2" style={{ fontSize: "clamp(27px,3vw,36px)", lineHeight: 1.1 }}>{t("spot2.title")}</h3>
              <p style={{ fontSize: 16, lineHeight: 1.65, color: "var(--ink-soft)", marginTop: 16 }}>{t("spot2.desc")}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 13, marginTop: 22 }}>
                {["a", "b", "c"].map((i) => (
                  <div key={i} className="vc-feat-check"><Check size={18} strokeWidth={2.2} style={{ color: "var(--accent)" }} />{t(`spot2.check.${i}`)}</div>
                ))}
              </div>
            </div>
          </div>

          {/* feature grid */}
          <div className="vc-feat-grid">
            {featureCards.map(({ icon: Icon, k }) => (
              <div key={k} className="vc-feat-card">
                <div className="vc-feat-icon"><Icon size={22} strokeWidth={1.7} /></div>
                <h3>{t(`feat.${k}.title`)}</h3>
                <p>{t(`feat.${k}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PAN-AFRICAN BAND ============ */}
      <section className="vc-section vc-band">
        <div className="vc-band-grid" />
        <div className="vc-wrap" style={{ position: "relative" }}>
          <div style={{ maxWidth: 720 }}>
            <div className="vc-eyebrow" style={{ color: "var(--mint)" }}>{t("band.eyebrow")}</div>
            <h2 className="vc-h2" style={{ color: "#fff", fontSize: "clamp(34px,4.6vw,52px)" }}>{t("band.title")}</h2>
            <p className="vc-lead" style={{ color: "rgba(231,242,237,.78)" }}>{t("band.lead")}</p>
          </div>
          <div className="vc-band-list">
            {["villages", "alumni", "churches", "savings", "coops", "hometown"].map((k, i) => (
              <span key={k} style={{ display: "contents" }}>
                <span style={{ color: i % 2 === 0 ? "#fff" : "var(--mint)" }}>{t(`band.${k}`)}</span>
                {i < 5 && <span className="vc-band-dot">●</span>}
              </span>
            ))}
          </div>
          <p style={{ fontFamily: "var(--sans)", fontSize: 14.5, lineHeight: 1.6, color: "rgba(231,242,237,.6)", marginTop: 20 }}>{t("band.aliases")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 46 }}>
            {countries.map((c) => (
              <span key={c} className="vc-chip"><b>{c}</b>{t(`countries.${c}`)}</span>
            ))}
          </div>
        </div>
      </section>

      {/* ============ HOW IT WORKS ============ */}
      <section id="how" className="vc-section">
        <div className="vc-wrap">
          <div style={{ textAlign: "center", maxWidth: 620, margin: "0 auto" }}>
            <div className="vc-eyebrow">{t("how.eyebrow")}</div>
            <h2 className="vc-h2">{t("how.title")}</h2>
            <p className="vc-lead">{t("how.lead")}</p>
          </div>
          <div className="vc-steps">
            <div className="vc-steps-line" />
            {steps.map((k, i) => (
              <div key={k} className="vc-step">
                <div className={`vc-step-num${i === 2 ? " filled" : ""}`}>{i + 1}</div>
                <h3>{t(`how.${k}.title`)}</h3>
                <p>{t(`how.${k}.desc`)}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ TESTIMONIALS ============ */}
      <section className="vc-section vc-testi">
        <div className="vc-wrap">
          <div style={{ maxWidth: 660 }}>
            <div className="vc-eyebrow">{t("testi.eyebrow")}</div>
            <h2 className="vc-h2">{t("testi.title")}</h2>
          </div>
          <div className="vc-testi-feat">
            <div style={{ flex: "2 1 420px", minWidth: 0 }}>
              <div className="vc-stars">{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={20} fill="currentColor" stroke="none" />)}</div>
              <p style={{ fontFamily: "var(--serif)", fontSize: "clamp(22px,2.5vw,28px)", lineHeight: 1.45, letterSpacing: "-.01em", color: "var(--ink)", marginTop: 20 }}>{t("testi.featured.quote")}</p>
            </div>
            <div style={{ flex: "1 1 220px", borderLeft: "1px solid var(--line)", paddingLeft: 28 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
                <span style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--accent-soft)", color: "var(--accent-strong)", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>CN</span>
                <div><div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>Cyril N.</div><div style={{ fontSize: 13.5, color: "var(--ink-soft)" }}>{t("testi.featured.group")}</div></div>
              </div>
              <span className="vc-chip" style={{ marginTop: 18, color: "var(--ink-soft)", background: "var(--bg)", borderColor: "var(--line)" }}><b style={{ color: "var(--accent-strong)", background: "var(--bg)", border: "1px solid var(--line)" }}>CM</b>{t("countries.CM")}</span>
            </div>
          </div>
          <div className="vc-testi-grid">
            {testimonials.map((k) => (
              <div key={k} className="vc-testi-card">
                <div className="vc-stars">{Array.from({ length: 5 }).map((_, i) => <Star key={i} size={15} fill="currentColor" stroke="none" />)}</div>
                <p>{t(`testi.${k}.quote`)}</p>
                <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 20, paddingTop: 18, borderTop: "1px solid var(--line)" }}>
                  <span className="vc-avatar">{t(`testi.${k}.initials`)}</span>
                  <div style={{ minWidth: 0 }}><div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--ink)" }}>{t(`testi.${k}.name`)}</div><div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{t(`testi.${k}.meta`)}</div></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ PRICING ============ */}
      <section id="pricing" className="vc-section">
        <div className="vc-wrap">
          <div style={{ textAlign: "center", maxWidth: 640, margin: "0 auto" }}>
            <div className="vc-eyebrow">{t("pricing.eyebrow")}</div>
            <h2 className="vc-h2">{t("pricing.title")}</h2>
            <p className="vc-lead">{t("pricing.lead")}</p>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 18, fontSize: 13.5, fontWeight: 600, color: "var(--accent-strong)", background: "var(--accent-soft)", padding: "8px 15px", borderRadius: 100 }}><Check size={16} strokeWidth={2} />{t("pricing.noCut")}</span>
          </div>
          <div className="vc-price-grid">
            {tiers.map(({ k, featured, cta }) => (
              <div key={k} className={`vc-price${featured ? " featured" : ""}`}>
                {featured && <span className="vc-price-badge">{t("pricing.popular")}</span>}
                <div className="vc-price-name">{t(`pricing.${k}.name`)}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 14 }}>
                  <span className="vc-price-amt">{t(`pricing.${k}.price`)}</span>
                  <span style={{ fontSize: 14, color: "var(--ink-faint)" }}>{t(`pricing.${k}.per`)}</span>
                </div>
                <div className="vc-price-note">{t(`pricing.${k}.note`)}</div>
                <div className="vc-price-feats">
                  {Array.from({ length: tierFeatures[k] }).map((_, i) => (
                    <div key={i} className="vc-price-feat"><Check size={16} strokeWidth={featured ? 2.4 : 2.2} style={{ color: "var(--accent)" }} />{t(`pricing.${k}.f${i + 1}`)}</div>
                  ))}
                </div>
                {cta === "muted" ? (
                  <span className="vc-price-btn muted">{t("pricing.comingSoon")}</span>
                ) : cta === "solid" ? (
                  <span className="vc-price-btn solid">{t("pricing.comingSoon")}</span>
                ) : k === "enterprise" ? (
                  <Link href="/contact" className="vc-price-btn outline">{t("pricing.contact")}</Link>
                ) : (
                  <Link href="/signup" className="vc-price-btn outline">{t("pricing.getStarted")}</Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FAQ ============ */}
      <section id="faq" className="vc-section vc-faq">
        <div className="vc-wrap" style={{ display: "flex", flexWrap: "wrap", gap: 56 }}>
          <div style={{ flex: "1 1 300px", maxWidth: 380 }}>
            <div className="vc-eyebrow">{t("faq.eyebrow")}</div>
            <h2 className="vc-h2">{t("faq.title")}</h2>
            <p className="vc-lead" style={{ fontSize: 18 }}>{t("faq.lead")}</p>
            <Link href="/contact" style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 22, fontSize: 14.5, fontWeight: 600, color: "var(--accent-strong)" }}>{t("faq.talk")}<ArrowRight size={16} strokeWidth={2} /></Link>
          </div>
          <div style={{ flex: "2 1 460px", minWidth: 0 }}>
            {faqs.map((k) => (
              <details key={k}>
                <summary><span className="vc-q">{t(`faq.${k}.q`)}</span><ChevronDown className="vc-chev" size={20} strokeWidth={2} /></summary>
                <p>{t(`faq.${k}.a`)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ============ FINAL CTA ============ */}
      <section className="vc-finalcta">
        <div className="vc-finalcta-grid" />
        <div style={{ position: "relative", maxWidth: 760, margin: "0 auto", padding: "var(--sp) 28px", textAlign: "center" }}>
          <h2 style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: "clamp(36px,5vw,58px)", lineHeight: 1.04, letterSpacing: "-.025em", color: "#fff" }}>{t("finalCta.title")}</h2>
          <p style={{ fontFamily: "var(--serif)", fontSize: 20, lineHeight: 1.6, color: "rgba(231,242,237,.82)", margin: "20px auto 0", maxWidth: "48ch" }}>{t("finalCta.lead")}</p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, justifyContent: "center", marginTop: 34 }}>
            <Link href="/signup" className="vc-btn-light">{t("hero.startFree")}<ArrowRight size={17} strokeWidth={2} /></Link>
            <a href="#how" className="vc-btn-ghost">{t("hero.bookDemo")}</a>
          </div>
          <p style={{ fontSize: 13.5, color: "rgba(231,242,237,.6)", marginTop: 22 }}>{t("finalCta.note")}</p>
        </div>
      </section>

      {/* ============ FOOTER ============ */}
      <footer className="vc-footer">
        <div className="vc-footer-grid">
          <div>
            <a href="#top" className="vc-nav-brand"><img src="/logo-mark.svg" alt="" width={28} height={28} /><span style={{ color: "var(--ink)" }}>VillageClaq</span></a>
            <p style={{ fontSize: 14, color: "var(--ink-soft)", lineHeight: 1.6, marginTop: 16, maxWidth: "30ch" }}>{t("footer.tagline")}</p>
            <p style={{ fontSize: 13, color: "var(--ink-faint)", marginTop: 14 }}>{t("footer.builtWith")}</p>
          </div>
          <div>
            <div className="vc-footer-col-h">{t("footer.product")}</div>
            <div className="vc-footer-links"><a href="#features">{t("nav.features")}</a><a href="#how">{t("nav.how")}</a><a href="#pricing">{t("nav.pricing")}</a></div>
          </div>
          <div>
            <div className="vc-footer-col-h">{t("footer.company")}</div>
            <div className="vc-footer-links"><Link href="/about">{t("footer.about")}</Link><Link href="/contact">{t("footer.contact")}</Link><Link href="/pricing">{t("nav.pricing")}</Link></div>
          </div>
          <div>
            <div className="vc-footer-col-h">{t("footer.legal")}</div>
            <div className="vc-footer-links"><Link href="/privacy">{t("footer.privacy")}</Link><Link href="/terms">{t("footer.terms")}</Link></div>
          </div>
        </div>
        <div className="vc-footer-bottom">
          <span>{t("footer.copyright")}</span>
          <span>{t("footer.langLine")}</span>
        </div>
      </footer>
    </div>
  );
}
