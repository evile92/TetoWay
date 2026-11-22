import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const SITE_ORIGIN = 'https://tetoway.vercel.app';

function escapeXml(value) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function buildUrlEntry(loc, options) {
  const { lastmod, changefreq = 'weekly', priority = '0.8', alternates = [] } = options;
  const altLines = alternates
    .map(
      (alt) =>
        `    <xhtml:link rel="alternate" hreflang="${escapeXml(alt.hreflang)}" href="${escapeXml(alt.href)}" />`,
    )
    .join('\n');

  return [
    '  <url>',
    `    <loc>${escapeXml(loc)}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    altLines,
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');
}

async function main() {
  const linesRaw = await fs.readFile(path.join(PUBLIC_DIR, 'data', 'tetouan-lines.json'), 'utf8');
  const lines = JSON.parse(linesRaw);
  const lastmod = new Date().toISOString().slice(0, 10);

  const robotsTxt = [
    'User-agent: *',
    'Allow: /',
    'Disallow: /*?*editor=',
    'Disallow: /*?*admin=',
    '',
    `Sitemap: ${SITE_ORIGIN}/sitemap.xml`,
    '',
  ].join('\n');

  const homeAlternates = [
    { hreflang: 'en', href: `${SITE_ORIGIN}/` },
    { hreflang: 'ar', href: `${SITE_ORIGIN}/?lang=ar` },
    { hreflang: 'x-default', href: `${SITE_ORIGIN}/` },
  ];

  const entries = [
    buildUrlEntry(`${SITE_ORIGIN}/`, {
      lastmod,
      changefreq: 'weekly',
      priority: '1.0',
      alternates: homeAlternates,
    }),
    buildUrlEntry(`${SITE_ORIGIN}/?lang=ar`, {
      lastmod,
      changefreq: 'weekly',
      priority: '0.95',
      alternates: homeAlternates,
    }),
    buildUrlEntry(`${SITE_ORIGIN}/?mode=planner`, {
      lastmod,
      changefreq: 'weekly',
      priority: '0.85',
    }),
  ];

  for (const line of lines) {
    const enUrl = `${SITE_ORIGIN}/?line=${encodeURIComponent(line.number)}`;
    const arUrl = `${SITE_ORIGIN}/?line=${encodeURIComponent(line.number)}&lang=ar`;
    const alternates = [
      { hreflang: 'en', href: enUrl },
      { hreflang: 'ar', href: arUrl },
      { hreflang: 'x-default', href: enUrl },
    ];

    entries.push(
      buildUrlEntry(enUrl, {
        lastmod,
        changefreq: 'monthly',
        priority: '0.8',
        alternates,
      }),
      buildUrlEntry(arUrl, {
        lastmod,
        changefreq: 'monthly',
        priority: '0.8',
        alternates,
      }),
    );
  }

  const sitemapXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
    '        xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');

  await fs.writeFile(path.join(PUBLIC_DIR, 'robots.txt'), robotsTxt, 'utf8');
  await fs.writeFile(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemapXml, 'utf8');

  console.log(`Generated robots.txt and sitemap.xml (${entries.length} URL entries).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
