/**
 * ELECTROMEL — generate-icons.js
 * Genera todos los íconos PWA necesarios.
 *
 * Uso:
 *   node generate-icons.js [ruta-a-logo.png]
 *
 * Si no se provee logo, genera íconos SVG con el rayo ELECTROMEL.
 * Requiere: npm install sharp (solo para PNG desde PNG)
 *
 * Para GitHub Pages sin Node: los íconos SVG inline se generan
 * automáticamente con este script y se guardan en /icons/
 */

const fs   = require('fs');
const path = require('path');

const SIZES = [72, 96, 128, 144, 152, 192, 384, 512];
const OUT   = path.join(__dirname, 'icons');

if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

/* ── Generar SVG para cada tamaño ────────────────────────── */
function generateSVG(size, maskable = false) {
  const padding = maskable ? Math.round(size * 0.1) : 0;
  const inner   = size - padding * 2;
  const rx      = maskable ? Math.round(size * 0.5) : Math.round(size * 0.18);

  /* Coordenadas del rayo escaladas */
  const s = inner / 44;
  const pts = [
    [25*s + padding, 4*s  + padding],
    [16*s + padding, 22*s + padding],
    [22*s + padding, 22*s + padding],
    [20*s + padding, 40*s + padding],
    [30*s + padding, 20*s + padding],
    [23*s + padding, 20*s + padding],
  ].map(([x,y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${rx}" fill="#1a1a1a"/>
  <polygon points="${pts}" fill="#e8a020"/>
</svg>`;
}

/* ── Escribir todos los tamaños ──────────────────────────── */
const sourceImg = process.argv[2];

if (sourceImg && fs.existsSync(sourceImg) && sourceImg.endsWith('.png')) {
  /* Si se provee un PNG, usar sharp para redimensionar */
  try {
    const sharp = require('sharp');
    console.log('Usando sharp para generar íconos desde:', sourceImg);

    const tasks = [];
    SIZES.forEach(size => {
      tasks.push(
        sharp(sourceImg)
          .resize(size, size, { fit: 'contain', background: { r: 26, g: 26, b: 26, alpha: 1 } })
          .png()
          .toFile(path.join(OUT, `icon-${size}.png`))
          .then(() => console.log(`  ✓ icon-${size}.png`))
      );
    });

    /* Maskable (con padding extra) */
    tasks.push(
      sharp(sourceImg)
        .resize(154, 154, { fit: 'contain', background: { r: 26, g: 26, b: 26, alpha: 1 } })
        .extend({ top: 19, bottom: 19, left: 19, right: 19, background: { r: 26, g: 26, b: 26, alpha: 1 } })
        .resize(192, 192)
        .png()
        .toFile(path.join(OUT, 'icon-maskable-192.png'))
        .then(() => console.log('  ✓ icon-maskable-192.png'))
    );
    tasks.push(
      sharp(sourceImg)
        .resize(410, 410, { fit: 'contain', background: { r: 26, g: 26, b: 26, alpha: 1 } })
        .extend({ top: 51, bottom: 51, left: 51, right: 51, background: { r: 26, g: 26, b: 26, alpha: 1 } })
        .resize(512, 512)
        .png()
        .toFile(path.join(OUT, 'icon-maskable-512.png'))
        .then(() => console.log('  ✓ icon-maskable-512.png'))
    );

    Promise.all(tasks).then(() => {
      console.log('\n✅ Íconos generados en /icons/');
      generateReadme();
    }).catch(console.error);

  } catch(e) {
    console.warn('sharp no disponible, generando SVG:', e.message);
    generateAllSVG();
  }
} else {
  console.log('Generando íconos SVG (sin logo personalizado)...');
  console.log('Para usar tu logo: node generate-icons.js ruta/a/tu/logo.png\n');
  generateAllSVG();
}

function generateAllSVG() {
  /* Generar SVG y también crear PNG simples via Canvas si está en Node */
  SIZES.forEach(size => {
    const svg = generateSVG(size, false);
    fs.writeFileSync(path.join(OUT, `icon-${size}.svg`), svg);
    console.log(`  ✓ icon-${size}.svg`);
  });

  /* Maskable */
  fs.writeFileSync(path.join(OUT, 'icon-maskable-192.svg'), generateSVG(192, true));
  fs.writeFileSync(path.join(OUT, 'icon-maskable-512.svg'), generateSVG(512, true));
  console.log('  ✓ icon-maskable-192.svg');
  console.log('  ✓ icon-maskable-512.svg');

  console.log('\n⚠️  Se generaron SVGs. Para PWA Android se recomiendan PNGs.');
  console.log('   Instalá sharp y corré: node generate-icons.js tu-logo.png');
  console.log('   O convertí los SVGs en PNGs con cualquier herramienta online.\n');
  console.log('✅ Archivos en /icons/');

  /* Actualizar manifest para usar SVG */
  updateManifestForSVG();
  generateReadme();
}

function updateManifestForSVG() {
  const manifestPath = path.join(__dirname, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.icons = [
    ...SIZES.map(s => ({
      src:     `icons/icon-${s}.svg`,
      sizes:   `${s}x${s}`,
      type:    'image/svg+xml',
      purpose: 'any'
    })),
    { src: 'icons/icon-maskable-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'maskable' },
    { src: 'icons/icon-maskable-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
  ];
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log('  ✓ manifest.json actualizado con SVGs');
}

function generateReadme() {
  const readme = `# ELECTROMEL — Íconos PWA

## Íconos generados

| Archivo | Tamaño | Uso |
|---------|--------|-----|
${SIZES.map(s => `| icon-${s}.png/.svg | ${s}×${s} | Android, iOS |`).join('\n')}
| icon-maskable-192.png/.svg | 192×192 | Android adaptativo |
| icon-maskable-512.png/.svg | 512×512 | Android splash |

## Para usar tu propio logo

\`\`\`bash
npm install sharp
node generate-icons.js ruta/a/tu/logo.png
\`\`\`

El logo debe ser:
- PNG de alta resolución (mínimo 512×512 px recomendado)
- Fondo transparente o negro (#1a1a1a)
- Sin márgenes excesivos

## Para GitHub Pages

Los íconos se sirven directamente desde la carpeta /icons/.
No se necesita ninguna configuración adicional.
`;
  fs.writeFileSync(path.join(OUT, 'README.md'), readme);
}
