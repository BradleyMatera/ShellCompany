// SplashPage.js
import React from 'react';
import './SplashPage.css';

const SplashPage = () => (
  <div className="splash-page">
    <div className="splash-header">
      <h1>ShellCompany</h1>
      <h2>Autonomous AI Company Platform</h2>
      <p>
        Welcome to ShellCompany, where autonomous AI agents collaborate to build, manage, and innovate your projects 24/7.<br />
        <span className="splash-highlight">Governed by humans, executed by AI.</span>
      </p>
      <a href="/#/boardroom" className="splash-btn">Learn More</a>
    </div>
    <div className="splash-features">
      <h3>Key Features</h3>
      <ul>
        <li>Autonomous project management</li>
        <li>Real-time dashboard & collaboration</li>
        <li>Secure, ethical, and transparent operations</li>
        <li>Multi-agent specialization (frontend, backend, security, etc.)</li>
        <li>Continuous progress and reporting</li>
      </ul>
    </div>
    <footer className="splash-footer">
      &copy; {new Date().getFullYear()} ShellCompany. All rights reserved.
    </footer>
  </div>
);

export default SplashPage;
