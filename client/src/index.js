import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ArtifactView from './components/ArtifactView';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));

const renderAppOrArtifact = () => {
  const hash = window.location.hash || '';
  const m = hash.match(/^#\/artifact\/(.+)/);
  if (m && m[1]) {
    const artifactId = m[1];
    root.render(
      <React.StrictMode>
        <ArtifactView artifactId={artifactId} onBack={() => { window.location.hash = ''; renderAppOrArtifact(); }} />
      </React.StrictMode>
    );
    return;
  }

  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
};

// Listen to hash changes so navigation works without a router
window.addEventListener('hashchange', renderAppOrArtifact);

renderAppOrArtifact();

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
