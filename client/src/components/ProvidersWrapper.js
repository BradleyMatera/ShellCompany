import React from 'react';

export default function ProvidersWrapper({ children }) {
  return (
    <div style={{ padding: 12, borderRadius: 8, background: 'rgba(15, 23, 42, 0.02)' }}>
      {children}
    </div>
  );
}
