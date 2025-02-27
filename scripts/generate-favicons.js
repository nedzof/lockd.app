import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const svgPath = path.join(__dirname, '../src/frontend/assets/favicon.svg');
const outputDir = path.join(__dirname, '../src/frontend/assets/favicons');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Check if Inkscape is installed
try {
  execSync('which inkscape', { stdio: 'ignore' });
  console.log('Using Inkscape to convert SVG to PNG and ICO');
  
  // Generate PNG files
  execSync(`inkscape --export-filename="${path.join(outputDir, 'favicon-16x16.png')}" -w 16 -h 16 "${svgPath}"`, { stdio: 'inherit' });
  execSync(`inkscape --export-filename="${path.join(outputDir, 'favicon-32x32.png')}" -w 32 -h 32 "${svgPath}"`, { stdio: 'inherit' });
  execSync(`inkscape --export-filename="${path.join(outputDir, 'favicon-48x48.png')}" -w 48 -h 48 "${svgPath}"`, { stdio: 'inherit' });
  
  // Generate ICO file (requires ImageMagick)
  try {
    execSync('which convert', { stdio: 'ignore' });
    console.log('Using ImageMagick to create ICO file');
    execSync(`convert "${path.join(outputDir, 'favicon-16x16.png')}" "${path.join(outputDir, 'favicon-32x32.png')}" "${path.join(outputDir, 'favicon-48x48.png')}" "${path.join(outputDir, 'favicon.ico')}"`, { stdio: 'inherit' });
  } catch (error) {
    console.log('ImageMagick not found. ICO file not created.');
    console.log('To create ICO file, install ImageMagick: sudo apt-get install imagemagick');
  }
} catch (error) {
  console.log('Inkscape not found. Using alternative method if available...');
  console.log('To generate high-quality favicons, install Inkscape: sudo apt-get install inkscape');
  
  // Alternative: Use a placeholder message
  console.log('Please manually convert the SVG to PNG and ICO files using a graphics editor.');
}

console.log('Favicon generation script completed.');
