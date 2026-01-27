'use client';

import { useThemeMode } from '@/providers/ThemeProvider';
import { useLanguage } from '@/providers/LanguageProvider';

export default function TermsOfServicePage() {
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
            Terms of Service
          </h1>
          <p className={`text-sm ${textClass}`}>
            Last updated: {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>

        <div className={`space-y-8 ${textClass} leading-relaxed`}>
          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              1. Agreement to Terms
            </h2>
            <p className="mb-4">
              By accessing or using Pepper 2.0 ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you disagree with any part of these Terms, you may not access the Service.
            </p>
            <p>
              These Terms apply to all users, including but not limited to lawyers, law firms, legal professionals, and any other individuals or entities who access or use the Service.
            </p>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              2. Description of Service
            </h2>
            <p className="mb-4">
              Pepper 2.0 is an AI-powered legal workflow assistant platform that provides:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2 ml-4">
              <li>Case management and tracking tools</li>
              <li>AI-powered legal document analysis and generation</li>
              <li>Calendar integration and deadline management</li>
              <li>Legal research and jurisprudence search capabilities</li>
              <li>Document storage and organization</li>
              <li>Integration with third-party legal and productivity services</li>
            </ul>
            <p>
              We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time, with or without notice.
            </p>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              3. User Accounts and Registration
            </h2>
            <p className="mb-4">
              To use certain features of the Service, you must:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2 ml-4">
              <li>Create an account and provide accurate, current, and complete information</li>
              <li>Maintain and promptly update your account information</li>
              <li>Maintain the security of your account credentials</li>
              <li>Accept responsibility for all activities that occur under your account</li>
              <li>Notify us immediately of any unauthorized use of your account</li>
            </ul>
            <p>
              You are responsible for maintaining the confidentiality of your account password and for all activities that occur under your account.
            </p>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              4. Acceptable Use
            </h2>
            <p className="mb-4">
              You agree to use the Service only for lawful purposes and in accordance with these Terms. You agree not to:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2 ml-4">
              <li>Use the Service in any way that violates any applicable law or regulation</li>
              <li>Infringe upon the rights of others, including intellectual property rights</li>
              <li>Upload or transmit any malicious code, viruses, or harmful software</li>
              <li>Attempt to gain unauthorized access to the Service or related systems</li>
              <li>Interfere with or disrupt the Service or servers connected to the Service</li>
              <li>Use the Service to transmit spam, unsolicited messages, or advertising</li>
              <li>Impersonate any person or entity or misrepresent your affiliation</li>
              <li>Collect or harvest information about other users without their consent</li>
            </ul>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              5. Intellectual Property Rights
            </h2>
            <h3 className={`text-xl font-semibold mb-3 mt-4 ${headingClass}`}>
              5.1 Our Intellectual Property
            </h3>
            <p className="mb-4">
              The Service and its original content, features, and functionality are owned by EM Technology Solutions and are protected by international copyright, trademark, patent, trade secret, and other intellectual property laws.
            </p>

            <h3 className={`text-xl font-semibold mb-3 mt-4 ${headingClass}`}>
              5.2 Your Content
            </h3>
            <p className="mb-4">
              You retain ownership of any content, documents, or data you upload to the Service ("Your Content"). By uploading Your Content, you grant us a limited, non-exclusive, worldwide, royalty-free license to:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2 ml-4">
              <li>Store, process, and display Your Content to provide the Service</li>
              <li>Use Your Content to generate AI-powered responses and analysis</li>
              <li>Create backups and ensure data availability</li>
            </ul>
            <p>
              You represent and warrant that you have all necessary rights to grant this license and that Your Content does not violate any third-party rights.
            </p>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              6. AI-Generated Content Disclaimer
            </h2>
            <p className="mb-4">
              The Service uses artificial intelligence to generate legal content, analysis, and suggestions. You acknowledge and agree that:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2 ml-4">
              <li>AI-generated content is provided for informational and assistance purposes only</li>
              <li>AI-generated content does not constitute legal advice</li>
              <li>You are responsible for reviewing, verifying, and validating all AI-generated content</li>
              <li>You should consult with qualified legal professionals for legal advice</li>
              <li>We are not responsible for any decisions made based on AI-generated content</li>
            </ul>
            <p>
              The Service is a tool to assist legal professionals and does not replace professional legal judgment.
            </p>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              7. Payment Terms
            </h2>
            <p className="mb-4">
              Certain features of the Service may require payment. By subscribing to a paid plan, you agree to:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2 ml-4">
              <li>Pay all fees associated with your subscription</li>
              <li>Provide accurate billing and payment information</li>
              <li>Authorize us to charge your payment method for recurring fees</li>
              <li>Understand that fees are non-refundable except as required by law</li>
            </ul>
            <p className="mb-4">
              We reserve the right to change our pricing with 30 days' notice. Your continued use of the Service after the price change constitutes acceptance of the new pricing.
            </p>
            <p>
              Subscriptions automatically renew unless cancelled. You may cancel your subscription at any time through your account settings.
            </p>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              8. Third-Party Services and Integrations
            </h2>
            <p className="mb-4">
              The Service integrates with third-party services, including but not limited to:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2 ml-4">
              <li>Google Calendar for calendar synchronization</li>
              <li>Stripe for payment processing</li>
              <li>OpenAI for AI-powered features</li>
              <li>WhatsApp/Twilio for notifications</li>
            </ul>
            <p>
              Your use of third-party services is subject to their respective terms of service and privacy policies. We are not responsible for the availability, accuracy, or content of third-party services.
            </p>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              9. Privacy and Data Protection
            </h2>
            <p>
              Your use of the Service is also governed by our Privacy Policy. By using the Service, you consent to the collection and use of your information as described in our Privacy Policy. Please review our Privacy Policy to understand our practices.
            </p>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              10. Disclaimer of Warranties
            </h2>
            <p className="mb-4">
              THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2 ml-4">
              <li>Warranties of merchantability, fitness for a particular purpose, or non-infringement</li>
              <li>Warranties that the Service will be uninterrupted, secure, or error-free</li>
              <li>Warranties regarding the accuracy, reliability, or completeness of any content</li>
            </ul>
            <p>
              We do not warrant that the Service will meet your requirements or that any errors will be corrected.
            </p>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              11. Limitation of Liability
            </h2>
            <p className="mb-4">
              TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL EM TECHNOLOGY SOLUTIONS, ITS AFFILIATES, OR THEIR RESPECTIVE OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2 ml-4">
              <li>Any indirect, incidental, special, consequential, or punitive damages</li>
              <li>Loss of profits, revenue, data, or use</li>
              <li>Damages resulting from your use or inability to use the Service</li>
              <li>Damages resulting from any conduct or content of third parties</li>
            </ul>
            <p>
              Our total liability shall not exceed the amount you paid us in the 12 months preceding the claim.
            </p>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              12. Indemnification
            </h2>
            <p>
              You agree to indemnify, defend, and hold harmless EM Technology Solutions and its affiliates from any claims, damages, losses, liabilities, and expenses (including attorneys' fees) arising out of or relating to your use of the Service, violation of these Terms, or infringement of any rights of another party.
            </p>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              13. Termination
            </h2>
            <p className="mb-4">
              We may terminate or suspend your account and access to the Service immediately, without prior notice, for any reason, including:
            </p>
            <ul className="list-disc list-inside mb-4 space-y-2 ml-4">
              <li>Breach of these Terms</li>
              <li>Fraudulent, abusive, or illegal activity</li>
              <li>Non-payment of fees</li>
              <li>At our sole discretion</li>
            </ul>
            <p>
              Upon termination, your right to use the Service will cease immediately. You may terminate your account at any time by contacting us or through your account settings.
            </p>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              14. Governing Law and Dispute Resolution
            </h2>
            <p className="mb-4">
              These Terms shall be governed by and construed in accordance with the laws of [Your Jurisdiction], without regard to its conflict of law provisions.
            </p>
            <p>
              Any disputes arising out of or relating to these Terms or the Service shall be resolved through binding arbitration in accordance with the rules of [Arbitration Organization], except where prohibited by law.
            </p>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              15. Changes to Terms
            </h2>
            <p>
              We reserve the right to modify these Terms at any time. We will notify you of any material changes by posting the new Terms on this page and updating the "Last updated" date. Your continued use of the Service after such changes constitutes acceptance of the new Terms.
            </p>
          </section>

          <section className={`pb-6 border-b ${sectionClass}`}>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              16. Severability
            </h2>
            <p>
              If any provision of these Terms is found to be unenforceable or invalid, that provision shall be limited or eliminated to the minimum extent necessary, and the remaining provisions shall remain in full force and effect.
            </p>
          </section>

          <section>
            <h2 className={`text-2xl font-semibold mb-4 ${headingClass}`}>
              17. Contact Information
            </h2>
            <p className="mb-4">
              If you have any questions about these Terms of Service, please contact us:
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
