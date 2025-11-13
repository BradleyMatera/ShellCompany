"use client"
import React from 'react'

export default function Navbar() {
  return (
    <nav className="flex items-center justify-between max-w-6xl mx-auto">
      <div className="flex items-center gap-4">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-pink-500 shadow-lg" />
        <div>
          <div className="text-xl font-bold">ShellCompany</div>
          <div className="text-sm text-slate-400">Local admin</div>
        </div>
      </div>
      <div className="flex items-center gap-4">
        <button className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 transition">Refresh</button>
      </div>
    </nav>
  )
}
