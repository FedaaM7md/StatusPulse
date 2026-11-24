/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import type { ReactNode } from 'react';
import { PublicBrand } from '../components/PublicBrand';
import { readBootstrap } from '../lib/bootstrap';
import { LanguageSwitch } from '../components/Feedback';
import { PublicFooter } from '../components/PublicFooter';
import { useI18n, usePageTitle } from '../lib/i18n';
import { Link } from '../lib/router';

function LegalShell({
  titleKey,
  headingKey,
  eyebrowKey,
  children,
}: {
  titleKey: string;
  headingKey?: string;
  eyebrowKey: string;
  children: ReactNode;
}) {
  const { t, lang } = useI18n();
  const bootName = readBootstrap()?.status?.siteName?.[lang];
  const siteName = bootName || (lang === 'ar' ? 'وصلة باي' : 'Wasla Pay');
  usePageTitle(titleKey);
  const heading = headingKey ?? titleKey;
  return (
    <div className="public-shell min-h-screen bg-bg text-ink">
      <header className="border-b border-line bg-panel">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <PublicBrand name={siteName} />
          <div className="flex items-center gap-3">
            <LanguageSwitch />
            <Link to="/" className="text-[10px] text-muted hover:text-ink hover:underline">
              {t('public.statusTitle')}
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
        <p className="text-[10px] font-semibold text-faint">{t(eyebrowKey)}</p>
        <h1 className="mt-1 text-2xl font-semibold text-ink">{t(heading)}</h1>
        <div className="mt-5 space-y-4 text-sm leading-relaxed text-muted">{children}</div>
      </main>
      <PublicFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-sm font-semibold text-ink">{title}</h2>
      <div className="mt-1 space-y-2">{children}</div>
    </section>
  );
}

export function AboutPage() {
  const { t } = useI18n();
  return (
    <LegalShell titleKey="legal.about" headingKey="legal.aboutTitle" eyebrowKey="legal.about">
      <p>{t('legal.aboutLead')}</p>
      <Section title={t('legal.aboutWhatTitle')}>
        <p>{t('legal.aboutWhatBody')}</p>
      </Section>
      <Section title={t('legal.aboutDemoTitle')}>
        <p>{t('legal.aboutDemoBody')}</p>
      </Section>
      <Section title={t('legal.contactTitle')}>
        <p>{t('legal.contactBody')}</p>
        <p className="text-ink"><span dir="ltr">hello@statuspulse.example.com</span></p>
        <p>{t('legal.address')}</p>
      </Section>
    </LegalShell>
  );
}

export function PrivacyPage() {
  const { t } = useI18n();
  return (
    <LegalShell titleKey="legal.privacy" headingKey="legal.privacyTitle" eyebrowKey="legal.privacy">
      <p>{t('legal.privacyLead')}</p>
      <Section title={t('legal.privacyDataTitle')}><p>{t('legal.privacyDataBody')}</p></Section>
      <Section title={t('legal.privacyCookiesTitle')}><p>{t('legal.privacyCookiesBody')}</p></Section>
      <Section title={t('legal.privacySharingTitle')}><p>{t('legal.privacySharingBody')}</p></Section>
      <Section title={t('legal.privacyRetentionTitle')}><p>{t('legal.privacyRetentionBody')}</p></Section>
      <Section title={t('legal.contactTitle')}><p>{t('legal.privacyContactBody')}</p></Section>
    </LegalShell>
  );
}

export function TermsPage() {
  const { t } = useI18n();
  return (
    <LegalShell titleKey="legal.terms" headingKey="legal.termsTitle" eyebrowKey="legal.terms">
      <p>{t('legal.termsLead')}</p>
      <Section title={t('legal.termsUseTitle')}><p>{t('legal.termsUseBody')}</p></Section>
      <Section title={t('legal.termsDemoTitle')}><p>{t('legal.termsDemoBody')}</p></Section>
      <Section title={t('legal.termsAvailabilityTitle')}><p>{t('legal.termsAvailabilityBody')}</p></Section>
      <Section title={t('legal.termsLiabilityTitle')}><p>{t('legal.termsLiabilityBody')}</p></Section>
      <Section title={t('legal.contactTitle')}><p>{t('legal.termsContactBody')}</p></Section>
    </LegalShell>
  );
}

export function HelpPage() {
  const { t } = useI18n();
  const faqs = [
    ['legal.faq1q', 'legal.faq1a'],
    ['legal.faq2q', 'legal.faq2a'],
    ['legal.faq3q', 'legal.faq3a'],
    ['legal.faq4q', 'legal.faq4a'],
    ['legal.faq5q', 'legal.faq5a'],
  ] as const;
  return (
    <LegalShell titleKey="legal.help" headingKey="legal.helpTitle" eyebrowKey="legal.help">
      <p>{t('legal.helpLead')}</p>
      <div className="space-y-3">
        {faqs.map(([q, a]) => (
          <details key={q} className="border border-line bg-panel">
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-ink">{t(q)}</summary>
            <p className="border-t border-line px-4 py-3 text-sm text-muted">{t(a)}</p>
          </details>
        ))}
      </div>
      <Section title={t('legal.contactTitle')}><p>{t('legal.helpContactBody')}</p></Section>
    </LegalShell>
  );
}

export function ChangelogPage() {
  const { t } = useI18n();
  return (
    <LegalShell titleKey="legal.changelog" headingKey="legal.changelogTitle" eyebrowKey="legal.changelog">
      <p>{t('legal.changelogLead')}</p>
      <Section title={t('legal.changelogV1Title')}>
        <p>{t('legal.changelogV1Body')}</p>
      </Section>
    </LegalShell>
  );
}
