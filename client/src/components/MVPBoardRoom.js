// client/src/components/MVPBoardRoom.js
import React, { useState } from 'react';

export default function MVPBoardRoom({ onCreate }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onCreate({ title, description });
    setTitle('');
    setDescription('');
  };

  return (
    <div>
      <h2>Board Room (MVP)</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Directive Title"
          value={title}
          onChange={e => setTitle(e.target.value)}
          required
        />
        <br />
        <textarea
          placeholder="Description"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
        <br />
        <button type="submit">Create Directive</button>
      </form>
    </div>
  );
}
