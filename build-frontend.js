const fs = require('fs');
const path = require('path');

const DIST_DIR = path.join(__dirname, 'dist');

const FILES_TO_COPY = [
  'index.html',
  'login.html',
  'admin.html',
  'admin_login.html',
  'app.js',
  'translations.js',
  'style.css',
  'smooth.css',
  'logo.png',
  'manifest.json',
  'sw.js'
];

// Folders to copy recursively
const FOLDERS_TO_COPY = [
  'assets'
];

function cleanAndCreateDist() {
  if (fs.existsSync(DIST_DIR)) {
    console.log('Cleaning existing dist directory...');
    fs.rmSync(DIST_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(DIST_DIR);
  console.log('Created clean dist directory.');
}

function copyFiles() {
  FILES_TO_COPY.forEach(file => {
    const srcPath = path.join(__dirname, file);
    const destPath = path.join(DIST_DIR, file);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied ${file} to dist/`);
    } else {
      console.warn(`Warning: ${file} does not exist at root.`);
    }
  });
}

function copyFolderRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyFolderRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyFolders() {
  FOLDERS_TO_COPY.forEach(folder => {
    const srcPath = path.join(__dirname, folder);
    const destPath = path.join(DIST_DIR, folder);
    if (fs.existsSync(srcPath)) {
      copyFolderRecursive(srcPath, destPath);
      console.log(`Copied folder ${folder}/ recursively to dist/`);
    } else {
      console.warn(`Warning: folder ${folder} does not exist at root.`);
    }
  });
}

try {
  cleanAndCreateDist();
  copyFiles();
  copyFolders();
  console.log('Frontend build completed successfully!');
} catch (err) {
  console.error('Error building frontend:', err);
  process.exit(1);
}
