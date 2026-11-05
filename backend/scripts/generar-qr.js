'use strict';
/**
 * Genera el PNG del QR de acceso de una sesión: codifica SOLO la URL HTTPS https://<host>/s/<token>.
 * Uso: node scripts/generar-qr.js <qr_token> [salida.png]
 * La base se toma de PUBLIC_BASE_URL (backend/.env). Para que un teléfono lo abra necesita un host público HTTPS.
 */
require('dotenv').config({ path: require('node:path').join(__dirname, '..', '.env') });
const QRCode = require('qrcode');
const { TOKEN_REGEX } = require('../src/sesiones');

async function main() {
  const token = process.argv[2];
  if (!token || !TOKEN_REGEX.test(token)) {
    console.error('Uso: node scripts/generar-qr.js <qr_token> [salida.png]  (token: 8-64 caracteres A-Za-z0-9_-)');
    process.exit(1);
  }
  const base = (process.env.PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  if (!base.startsWith('https://')) {
    console.warn(`[aviso] PUBLIC_BASE_URL no es HTTPS (${base}): sirve solo para pruebas locales, no para el QR final.`);
  }
  const url = `${base}/s/${token}`;
  const salida = process.argv[3] || `qr-${token}.png`;
  await QRCode.toFile(salida, url, { width: 600, margin: 2, errorCorrectionLevel: 'M' });
  console.log(`QR generado: ${salida}\nURL codificada: ${url}`);
}

main();
