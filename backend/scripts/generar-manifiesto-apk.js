'use strict';
/**
 * Calcula tamaño y SHA-256 reales de un APK firmado y actualiza backend/data/descarga/apk.json.
 * Uso: node scripts/generar-manifiesto-apk.js <rutaApk> <versionName> <versionCode> <urlRelease> [--publicado]
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const args = process.argv.slice(2);
const publicado = args.includes('--publicado');
const posicionales = args.filter((a) => a !== '--publicado');

if (posicionales.length < 4) {
  console.error('Uso: node scripts/generar-manifiesto-apk.js <rutaApk> <versionName> <versionCode> <urlRelease> [--publicado]');
  process.exit(1);
}

const [rutaApk, versionName, versionCodeStr, urlDescarga] = posicionales;
const absApk = path.resolve(rutaApk);
if (!fs.existsSync(absApk)) {
  console.error(`No existe el archivo APK: ${absApk}`);
  process.exit(1);
}

const buffer = fs.readFileSync(absApk);
const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
const stats = fs.statSync(absApk);

const manifiesto = {
  publicado,
  version_name: versionName,
  version_code: Number(versionCodeStr),
  tamano_bytes: stats.size,
  sha256,
  fecha_publicacion: new Date().toISOString().slice(0, 10),
  min_sdk: 26,
  android_minimo: 'Android 8.0 (API 26)',
  url_descarga: urlDescarga,
};

const destino = path.join(__dirname, '..', 'data', 'descarga', 'apk.json');
fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, `${JSON.stringify(manifiesto, null, 2)}\n`, 'utf8');
console.log(`Manifiesto escrito en ${destino}: v${versionName} (${stats.size} bytes, publicado=${publicado})`);
