const fetch = require('node-fetch');

(async () => {
  try {
    const artifactId = process.argv[2] || '';
    if (!artifactId) {
      console.error('Usage: node test_artifact_file_download.js <artifactId>');
      process.exit(2);
    }

    const url = `http://localhost:3001/api/autonomous/artifacts/${artifactId}/file`;
    console.log('Fetching', url);
    const res = await fetch(url, { method: 'GET' });
    console.log('Status:', res.status);
    if (res.ok) {
      const buf = await res.arrayBuffer();
      console.log('Bytes downloaded:', buf.byteLength);
    } else {
      const text = await res.text();
      console.error('Error body:', text);
      process.exit(1);
    }
  } catch (e) {
    console.error('Error:', e && e.stack);
    process.exit(1);
  }
})();
