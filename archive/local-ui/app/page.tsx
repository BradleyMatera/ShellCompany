import React from 'react'
import Navbar from '../components/Navbar'
import EngineStatus from '../components/EngineStatus'

export default function Page() {
  return (
    <main className="p-8">
      <Navbar />
      <section className="max-w-6xl mx-auto mt-8">
        <div className="rounded-2xl bg-slate-800/60 p-8 shadow-xl">
          <h1 className="text-4xl font-extrabold leading-tight">ShellCompany — Local UI</h1>
          <p className="mt-3 text-slate-300">Admin dashboard for local provider management and agent health.</p>
        </div>
        <div className="mt-8">
          <EngineStatus />
        </div>
      </section>
    </main>
  )
}
