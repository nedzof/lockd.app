/**
 * Script to generate VAPID keys for Web Push
 * 
 * Run with: node src/scripts/generate-vapid-keys.js
 */

import webpush from 'web-push';

// Generate VAPID keys
const vapidKeys = webpush.generateVAPIDKeys();

console.log('VAPID Keys generated:');
console.log('===================');
console.log('Public Key:');
console.log(vapidKeys.publicKey);
console.log('===================');
console.log('Private Key:');
console.log(vapidKeys.privateKey);
console.log('===================');
console.log('Add these to your .env file:');
console.log(`VITE_PUBLIC_VAPID_KEY="${vapidKeys.publicKey}"`);
console.log(`VAPID_PRIVATE_KEY="${vapidKeys.privateKey}"`);
console.log(`VAPID_SUBJECT="mailto:your-email@example.com"`); 