// Service Worker — Gestão Comercial (Sense Sales)
// Responsabilidade principal: interceptar o Web Share Target para receber
// PDFs compartilhados do WhatsApp e passá-los ao app para importação AVIL.

const PENDING_CACHE = 'avil-pending-v1';
const SHARE_PATH = '/ESTOQUE-BETA-SUPABASE/web/';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Intercepta o POST enviado pelo sistema quando o usuário compartilha um PDF
  if (event.request.method === 'POST' && url.pathname === SHARE_PATH) {
    event.respondWith(handleShareTarget(event.request));
    return;
  }
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (file && (file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf'))) {
      const bytes = await file.arrayBuffer();
      const cache = await caches.open(PENDING_CACHE);
      await cache.put(
        new Request('/pending-avil-file'),
        new Response(bytes, {
          headers: {
            'Content-Type': 'application/pdf',
            'X-File-Name': file.name || 'avil.pdf',
            'Cache-Control': 'no-store',
          },
        }),
      );
    }
  } catch (err) {
    console.error('[SW] Erro ao capturar arquivo compartilhado:', err);
  }

  // Redireciona de volta ao app com flag para disparar o import
  return Response.redirect(SHARE_PATH + '?avil-import=1', 303);
}
