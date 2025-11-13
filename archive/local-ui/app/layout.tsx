import React from 'react'
import './globals.css'
import ProvidersWrapper from '../components/ProvidersWrapper'

export const metadata = {
  title: 'ShellCompany — Local UI',
  description: 'Local admin UI for ShellCompany'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ProvidersWrapper>
          <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-slate-100">
            {children}
          </div>
        </ProvidersWrapper>
      </body>
    </html>
  )
}
