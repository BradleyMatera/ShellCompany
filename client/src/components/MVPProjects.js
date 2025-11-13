// client/src/components/MVPProjects.js
import React, { useEffect, useState } from 'react';

export default function MVPProjects() {
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    fetch('/api/projects').then(res => res.json()).then(setProjects);
  }, []);

  return (
    <div>
      <h2>Projects (MVP)</h2>
      <ul>
        {projects.map(project => (
          <li key={project.id}>
            {project.name} ({project.status})
          </li>
        ))}
      </ul>
    </div>
  );
}
