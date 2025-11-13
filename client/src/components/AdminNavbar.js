import React from 'react';

import apiFetch from '../apiHelper';

export default function AdminNavbar({ onRefresh }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 40, height: 40, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#ec4899)' }} />
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>ShellCompany</div>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Local admin</div>
        </div>
      </div>
      <div>
        <button
          onClick={() => {
            try { if (typeof onRefresh === 'function') onRefresh(); else apiFetch('/api/engine/status?ping=true').catch(()=>{}); }
            catch(e){}
          }}
          style={{ padding: '8px 12px', borderRadius: 6, background: '#4f46e5', color: 'white', border: 'none', cursor: 'pointer' }}
        >
          Refresh
        </button>
      </div>
    </div>
  );
}
