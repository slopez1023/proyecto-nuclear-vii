'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { crearApp } = require('../src/app');
const { cargarSesiones } = require('../src/sesiones');

async function conApp(rutaManifiestoApk, fn) {
  const app = crearApp({
    sesiones: cargarSesiones(),
    youtube: { buscar: async () => [] },
    almacenEventos: { guardar: () => {} },
    config: { rutaManifiestoApk },
  });
  const srv = app.listen(0);
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    await fn(base);
  } finally {
    srv.close();
  }
}

test('F7 landing /descargar y API/redirección de APK', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ponga-descarga-'));
  const rutaManifiesto = path.join(tmpDir, 'apk.json');

  try {
    // 1. Sin manifiesto -> /descargar responde HTML con CSP y /api/descarga + /descargar/app.apk devuelven 503
    await conApp(rutaManifiesto, async (base) => {
      const html = await fetch(`${base}/descargar`);
      assert.equal(html.status, 200);
      assert.match(html.headers.get('content-security-policy') || '', /default-src 'self'/);
      assert.match(await html.text(), /PONGA PUES/);

      assert.equal((await fetch(`${base}/api/descarga`)).status, 503);
      assert.equal((await fetch(`${base}/descargar/app.apk`, { redirect: 'manual' })).status, 503);

      // Rutas existentes intactas
      assert.equal((await fetch(`${base}/s/demo-activa-001`)).status, 200);
      assert.equal((await fetch(`${base}/api/sesiones/demo-activa-001`)).status, 200);
    });

    // 2. Manifiesto no publicado -> /api/descarga 200 (publicado=false, url_descarga=null), app.apk 503
    fs.writeFileSync(rutaManifiesto, JSON.stringify({
      publicado: false,
      version_name: '0.2.0',
      version_code: 2,
      tamano_bytes: 123456,
      sha256: 'abc',
      fecha_publicacion: '2026-11-27',
      url_descarga: 'https://github.com/slopez1023/proyecto-nuclear-vii/releases/download/v0.2.0/ponga-pues-0.2.0.apk',
    }));
    await conApp(rutaManifiesto, async (base) => {
      const api = await fetch(`${base}/api/descarga`);
      assert.equal(api.status, 200);
      const body = await api.json();
      assert.equal(body.publicado, false);
      assert.equal(body.url_descarga, null);
      assert.equal((await fetch(`${base}/descargar/app.apk`, { redirect: 'manual' })).status, 503);
    });

    // 3. Host no permitido -> bloqueado incluso con publicado=true
    fs.writeFileSync(rutaManifiesto, JSON.stringify({
      publicado: true,
      version_name: '0.2.0',
      version_code: 2,
      tamano_bytes: 123456,
      sha256: 'abc',
      fecha_publicacion: '2026-11-27',
      url_descarga: 'https://evil.example.com/app.apk',
    }));
    await conApp(rutaManifiesto, async (base) => {
      const api = await (await fetch(`${base}/api/descarga`)).json();
      assert.equal(api.publicado, false);
      assert.equal((await fetch(`${base}/descargar/app.apk`, { redirect: 'manual' })).status, 503);
    });

    // 4. Publicado con host oficial de GitHub Releases -> 302 exacto con Cache-Control: no-store
    const urlOficial = 'https://github.com/slopez1023/proyecto-nuclear-vii/releases/download/v0.2.0/ponga-pues-0.2.0.apk';
    fs.writeFileSync(rutaManifiesto, JSON.stringify({
      publicado: true,
      version_name: '0.2.0',
      version_code: 2,
      tamano_bytes: 123456,
      sha256: 'abc',
      fecha_publicacion: '2026-11-27',
      url_descarga: urlOficial,
    }));
    await conApp(rutaManifiesto, async (base) => {
      const r = await fetch(`${base}/descargar/app.apk`, { redirect: 'manual' });
      assert.equal(r.status, 302);
      assert.equal(r.headers.get('location'), urlOficial);
      assert.equal(r.headers.get('cache-control'), 'no-store');
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
