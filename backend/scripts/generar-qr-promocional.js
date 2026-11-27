'use strict';
/**
 * Genera el código QR promocional oficial de PONGA PUES hacia la landing pública (/descargar)
 * en formatos PNG (alta resolución) y SVG vectorial, junto con url.txt e instrucciones de impresión.
 * Uso: node scripts/generar-qr-promocional.js
 */
const fs = require('node:fs');
const path = require('node:path');
const QRCode = require('qrcode');

const URL_PROMOCIONAL = 'https://proyecto-nuclear-vii-production.up.railway.app/descargar';
const DIR_SALIDA = path.join(__dirname, '..', '..', 'docs', 'f7', 'qr-promocional');

async function main() {
  fs.mkdirSync(DIR_SALIDA, { recursive: true });

  const rutaPng = path.join(DIR_SALIDA, 'ponga-pues-descargar.png');
  const rutaSvg = path.join(DIR_SALIDA, 'ponga-pues-descargar.svg');
  const rutaTxt = path.join(DIR_SALIDA, 'url.txt');
  const rutaInst = path.join(DIR_SALIDA, 'INSTRUCCIONES-IMPRESION.md');

  await QRCode.toFile(rutaPng, URL_PROMOCIONAL, {
    width: 2048,
    margin: 4,
    errorCorrectionLevel: 'H',
    color: { dark: '#090A0F', light: '#FFFFFF' },
  });

  const svg = await QRCode.toString(URL_PROMOCIONAL, {
    type: 'svg',
    margin: 4,
    errorCorrectionLevel: 'H',
    color: { dark: '#090A0F', light: '#FFFFFF' },
  });
  fs.writeFileSync(rutaSvg, svg, 'utf8');
  fs.writeFileSync(rutaTxt, `${URL_PROMOCIONAL}\n`, 'utf8');

  const instrucciones = `# Instrucciones de impresión — QR promocional PONGA PUES

> [!WARNING]
> **DOMINIO PROVISIONAL — NO IMPRIMIR COMO MATERIAL DEFINITIVO.**
> Este código QR apunta actualmente a \`${URL_PROMOCIONAL}\`. Si el proyecto cambia a un dominio propio, el QR deberá regenerarse antes de producir impresiones definitivas en acrílico, mesas o afiches permanentes.

## Archivo recomendado según uso
- **Imprenta / vector escalable:** \`ponga-pues-descargar.svg\`
- **Impresión digital / vista previa de alta resolución (2048 px):** \`ponga-pues-descargar.png\`

## Reglas de impresión y colocación
1. **Tamaño físico mínimo:** al menos **3 cm × 3 cm** (30 mm) en habladores de mesa, o **5 cm × 5 cm** en paredes o barras con menor iluminación.
2. **Zona de silencio:** conservar siempre el margen blanco exterior (equivalente a 4 módulos alrededor de todo el código). No recortar el borde ni colocar logos o texto pegados a los cuadros del QR.
3. **Contraste:** imprimir módulo oscuro sobre fondo blanco sólido y mate (evitar plásticos brillantes que reflejen luces de discoteca o bar).
4. **Nivel de corrección:** generado con corrección de errores **H (30 %)** para resistir desgaste ligero en mesas.
5. **Verificación previa a producción:** escanear la prueba impresa con al menos **dos teléfonos distintos** (Android e iOS) bajo la iluminación real del establecimiento y confirmar que abre exactamente \`/descargar\`.
`;
  fs.writeFileSync(rutaInst, instrucciones, 'utf8');

  console.log(`QR promocional generado en ${DIR_SALIDA}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
