import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Personal CFO - AI-Powered Finance Dashboard',
  description: 'Upload your financial statements and get comprehensive insights, trends, and actionable recommendations.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
