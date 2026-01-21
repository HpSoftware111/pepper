import type { Metadata } from 'next'
import './globals.css'
import { ThemeProvider } from '@/providers/ThemeProvider'
import { AuthProvider } from '@/providers/AuthProvider'
import { LanguageProvider } from '@/providers/LanguageProvider'

export const metadata: Metadata = {
  title: 'Pepper 2.0 - Legal Workflow Assistant',
  description: 'AI-powered legal case management and workflow automation',
  icons: {
    icon: '/assets/icons/favcon.ico',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          <ThemeProvider>
            <AuthProvider>{children}</AuthProvider>
          </ThemeProvider>
        </LanguageProvider>
      </body>
    </html>
  )
}
