// agent-artifact-sync.js
const fs = require('fs').promises;
const path = require('path');

const artifactsDir = path.join(__dirname, '../artifacts/nova');
const componentsDir = path.join(__dirname, '../../client/src/components');

async function syncArtifacts() {
  try {
    const files = await fs.readdir(artifactsDir);
    for (const file of files) {
      if (file.endsWith('.js')) {
        const srcPath = path.join(artifactsDir, file);
        const destPath = path.join(componentsDir, file);
        const content = await fs.readFile(srcPath, 'utf8');
        await fs.writeFile(destPath, content);
        console.log(`Synced ${file} to client/src/components`);
      }
    }
  } catch (err) {
    console.error('Artifact sync error:', err);
  }
}

syncArtifacts();
