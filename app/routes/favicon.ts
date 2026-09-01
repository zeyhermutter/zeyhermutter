const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="30" fill="#182826"/>
  <text x="32" y="38" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="20" font-weight="700">ZM</text>
</svg>`;

export function loader() {
  return new Response(favicon, {
    headers: {
      "Cache-Control": "public, max-age=86400, immutable",
      "Content-Type": "image/svg+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
