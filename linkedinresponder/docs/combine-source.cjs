const fs = require('fs');
const path = require('path');

const SRC_DIR = '../src';
const OUTPUT_FILE = './combined-source-code.txt';
const EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.mts', '.mjs'];

function getAllFiles(dirPath, arrayOfFiles = []) {
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    if (fs.statSync(filePath).isDirectory()) {
      arrayOfFiles = getAllFiles(filePath, arrayOfFiles);
    } else {
      const ext = path.extname(file);
      if (EXTENSIONS.includes(ext)) {
        arrayOfFiles.push(filePath);
      }
    }
  });

  return arrayOfFiles;
}

function combineFiles() {
  const files = getAllFiles(SRC_DIR).sort();
  let combined = '';
  
  combined += '='.repeat(100) + '\n';
  combined += 'LINKEDIN AUTORESPONDER - COMPLETE SOURCE CODE\n';
  combined += 'Generated: ' + new Date().toISOString() + '\n';
  combined += 'Total Files: ' + files.length + '\n';
  combined += '='.repeat(100) + '\n\n';

  files.forEach(filePath => {
    const relativePath = filePath.replace('../', '');
    const content = fs.readFileSync(filePath, 'utf-8');
    
    combined += '\n\n';
    combined += '='.repeat(100) + '\n';
    combined += `FILE: ${relativePath}\n`;
    combined += '='.repeat(100) + '\n\n';
    combined += content;
  });

  fs.writeFileSync(OUTPUT_FILE, combined, 'utf-8');
  console.log(`✅ Combined ${files.length} files into ${OUTPUT_FILE}`);
  console.log(`📄 File size: ${(fs.statSync(OUTPUT_FILE).size / 1024).toFixed(2)} KB`);
}

combineFiles();
