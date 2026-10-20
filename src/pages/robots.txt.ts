export const prerender = true;
export const GET = () =>
  new Response(`User-agent: *\nAllow: /\nDisallow: /go/\nDisallow: /api/\nDisallow: /hledat/\n\nSitemap: https://sportstreamy.cz/sitemap.xml\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
