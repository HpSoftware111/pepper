'use client';

import { useThemeMode } from '@/providers/ThemeProvider';
import { useLanguage } from '@/providers/LanguageProvider';

export default function PrivacyPolicyPage() {
  const { themeMode } = useThemeMode();
  const { t } = useLanguage();
  const isLight = themeMode === 'light';

  const containerClass = isLight
    ? 'bg-white text-slate-900'
    : 'bg-[rgba(5,18,45,0.95)] text-slate-50';

  const headingClass = isLight ? 'text-slate-900' : 'text-white';
  const textClass = isLight ? 'text-slate-700' : 'text-slate-300';
  const sectionClass = isLight ? 'border-slate-200' : 'border-slate-700';

  return (
    <div className={`min-h-screen ${containerClass} py-12 px-4 sm:px-6 lg:px-8`}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className={`text-4xl font-bold mb-4 ${headingClass}`}>
            Privacy Policy
          </h1>
          <p className={`text-sm ${textClass}`}>
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className={`space-y-8 ${textClass} leading-relaxed`}>
          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              1. Introduction
            </h2>
            <p className="mb-4">
              Pepper 2.0 ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our legal workflow assistant platform and services (collectively, the "Service").
            </p>
            <p>
              By using our Service, you agree to the collection and use of information in accordance with this policy.
            </p>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              2. Information We Collect
            </h2>

            <h3 className={`text-xl font-semibold mb-3 mt-4 ${headingClass}`}>
              2.1 Personal Information
            </h3>
            <p className="mb-4">
              We collect information that you provide directly to us, including:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2 ml-4">
              <li>Name, email address, and contact information</li>
              <li>Professional information (law firm, practice area, attorney credentials)</li>
              <li>Account credentials and authentication information</li>
              <li>Payment and billing information (processed securely through Stripe)</li>
            </ul>

            <h3 className={`text-xl font-semibold mb-3 mt-4 ${headingClass}`}>
              2.2 Case and Document Information
            </h3>
            <p className="mb-4">
              As a legal workflow assistant, we process:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2 ml-4">
              <li>Case documents, filings, and legal materials you upload</li>
              <li>Case information, deadlines, and calendar events</li>
              <li>Legal research queries and AI-generated content</li>
              <li>Client information and case metadata</li>
            </ul>

            <h3 className={`text-xl font-semibold mb-3 mt-4 ${headingClass}`}>
              2.3 Usage and Technical Information
            </h3>
            <p className="mb-4">
              We automatically collect certain information when you use our Service:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2 ml-4">
              <li>Device information and IP address</li>
              <li>Browser type and version</li>
              <li>Usage patterns and feature interactions</li>
              <li>Error logs and performance data</li>
            </ul>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              3. How We Use Your Information
            </h2>
            <p className="mb-4">
              We use the collected information for the following purposes:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2 ml-4">
              <li>To provide, maintain, and improve our Service</li>
              <li>To process your legal case management requests</li>
              <li>To generate AI-powered legal assistance and document analysis</li>
              <li>To send calendar reminders, notifications, and service updates</li>
              <li>To process payments and manage your subscription</li>
              <li>To comply with legal obligations and protect our rights</li>
              <li>To detect, prevent, and address technical issues and security threats</li>
            </ul>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              4. Information Sharing and Disclosure
            </h2>
            <p className="mb-4">
              We do not sell your personal information. We may share your information only in the following circumstances:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2 ml-4">
              <li>
                <strong>Service Providers:</strong> With trusted third-party service providers who assist in operating our Service (e.g., cloud hosting, payment processing, email services)
              </li>
              <li>
                <strong>AI Services:</strong> With AI service providers (e.g., OpenAI) to process legal documents and generate responses. These providers are bound by strict confidentiality agreements.
              </li>
              <li>
                <strong>Legal Requirements:</strong> When required by law, court order, or governmental authority
              </li>
              <li>
                <strong>Business Transfers:</strong> In connection with a merger, acquisition, or sale of assets
              </li>
              <li>
                <strong>With Your Consent:</strong> When you explicitly authorize us to share information
              </li>
            </ul>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              5. Data Security
            </h2>
            <p className="mb-4">
              We implement industry-standard security measures to protect your information:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2 ml-4">
              <li>Encryption of data in transit (SSL/TLS) and at rest</li>
              <li>Secure authentication and access controls</li>
              <li>Regular security audits and vulnerability assessments</li>
              <li>Encrypted storage of sensitive tokens and credentials</li>
              <li>Access logging and monitoring</li>
            </ul>
            <p>
              However, no method of transmission over the Internet or electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your information, we cannot guarantee absolute security.
            </p>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              6. Third-Party Integrations
            </h2>
            <p className="mb-4">
              Our Service integrates with third-party services:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2 ml-4">
              <li>
                <strong>Google Calendar:</strong> To sync deadlines and events. Your calendar data is processed according to Google's Privacy Policy.
              </li>
              <li>
                <strong>Stripe:</strong> For payment processing. Payment information is handled directly by Stripe and not stored on our servers.
              </li>
              <li>
                <strong>WhatsApp/Twilio:</strong> For sending notifications. Message content is processed according to Twilio's Privacy Policy.
              </li>
              <li>
                <strong>OpenAI:</strong> For AI-powered legal assistance. Document content is processed according to OpenAI's Privacy Policy.
              </li>
            </ul>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              7. Your Rights and Choices
            </h2>
            <p className="mb-4">
              You have the following rights regarding your personal information:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2 ml-4">
              <li><strong>Access:</strong> Request access to your personal information</li>
              <li><strong>Correction:</strong> Request correction of inaccurate information</li>
              <li><strong>Deletion:</strong> Request deletion of your account and data</li>
              <li><strong>Export:</strong> Request export of your data in a portable format</li>
              <li><strong>Opt-out:</strong> Unsubscribe from marketing communications</li>
              <li><strong>Account Settings:</strong> Update your preferences through your account settings</li>
            </ul>
            <p>
              To exercise these rights, please contact us at the email address provided below.
            </p>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              8. Data Retention
            </h2>
            <p className="mb-4">
              We retain your information for as long as necessary to:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2 ml-4">
              <li>Provide our Service to you</li>
              <li>Comply with legal obligations</li>
              <li>Resolve disputes and enforce agreements</li>
              <li>Maintain security and prevent fraud</li>
            </ul>
            <p>
              When you delete your account, we will delete or anonymize your personal information, except where we are required to retain it for legal or legitimate business purposes.
            </p>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              9. Children's Privacy
            </h2>
            <p>
              Our Service is not intended for individuals under the age of 18. We do not knowingly collect personal information from children. If you believe we have collected information from a child, please contact us immediately.
            </p>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              10. International Data Transfers
            </h2>
            <p>
              Your information may be transferred to and processed in countries other than your country of residence. These countries may have data protection laws that differ from those in your country. By using our Service, you consent to the transfer of your information to these countries.
            </p>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              11. Changes to This Privacy Policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page and updating the "Last updated" date. You are advised to review this Privacy Policy periodically for any changes.
            </p>
          </section>

          <section>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              12. Contact Us
            </h2>
            <p className="mb-4">
              If you have any questions about this Privacy Policy or our data practices, please contact us:
            </p>
            <div className={`p-4 rounded-lg ${isLight ? 'bg-slate-50' : 'bg-slate-800/50'}`}>
              <p className="mb-2">
                <strong>Email:</strong> info@emtechnologysolutions.com
              </p>
              <p className="mb-2">
                <strong>Website:</strong> https://pepper20.emtechnologysolutions.com
              </p>
              <p>
                <strong>Address:</strong> EM Technology Solutions
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
