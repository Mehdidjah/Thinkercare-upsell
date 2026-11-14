const SHELL = (body: string): string =>
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Touché Conseil</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:620px;margin:12vh auto;padding:24px;color:#191919}h1{font-size:28px}a{color:inherit}</style></head><body>${body}</body></html>`;

export function renderErrorPage(): string {
  return SHELL(
    '<h1>Touché Conseil</h1><p>Le service est temporairement indisponible. Les données déjà enregistrées sont conservées.</p><a href="/">Revenir à l’espace conseil</a>',
  );
}

export function renderNotFoundPage(): string {
  return SHELL('<h1>Cette page n’existe pas.</h1><a href="/">Retour au conseil</a>');
}
