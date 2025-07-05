#!/usr/bin/env node

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🚀 Setting up Canva to PSD Converter...\n');

try {
  // Install dependencies
  console.log('📦 Installing dependencies...');
  execSync('npm install', { stdio: 'inherit', cwd: __dirname });
  
  // Create necessary directories
  console.log('📁 Creating directories...');
  const dirs = ['uploads', 'downloads'];
  
  dirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`✅ Created ${dir} directory`);
    }
  });
  
  console.log('\n✅ Setup complete!');
  console.log('\n📋 Next steps:');
  console.log('1. Start the backend server: npm run server');
  console.log('2. In another terminal, start the frontend: npm run dev');
  console.log('3. Open http://localhost:5173 in your browser');
  console.log('\n🎉 Happy converting!');
  
} catch (error) {
  console.error('❌ Setup failed:', error.message);
  process.exit(1);
} 