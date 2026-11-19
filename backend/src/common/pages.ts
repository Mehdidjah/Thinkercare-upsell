const SHELL = (body: string): string =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>ThinkerCare</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:620px;margin:12vh auto;padding:24px;color:#191919}h1{font-size:28px}a{color:inherit}</style></head><body>${body}</body></html>`;

export function renderErrorPage(): string {
  return SHELL(
    '<h1>ThinkerCare</h1><p>La page n’a pas pu charger. Le service est temporairement indisponible. Les données déjà enregistrées sont conservées.</p><a href="/">Réessayer</a>',
  );
}

export function renderNotFoundPage(): string {
  return SHELL('<h1>Cette page n’existe pas.</h1><a href="/">Retour au conseil</a>');
}
