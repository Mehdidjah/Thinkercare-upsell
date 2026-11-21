import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import Analytics from '../src/ui/Analytics';

const admin = { id: 'a', label: 'Direction', role: 'admin', username: 'direction' };
const pilot = (initialTab?: string) => renderToStaticMarkup(<Analytics user={admin} users={[]} products={[]} resume={() => {}} initialTab={initialTab} />);

test('Pilotage: a visible « Marque » switch, « Toutes les marques » by default, on every filtered tab', () => {
  for (const tab of [undefined, 'calendar', 'operators', 'products', 'journal']) {
    const html = pilot(tab);
    expect(html, String(tab)).toContain('role="group" aria-label="Marque"');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Toutes les marques</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Touché</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>BEL\.NCO</);
    // One control for the brand: the old « Marque » list in the filters is gone.
    expect(html).not.toMatch(/<label class="field">Marque<select/);
  }
  // Views that ignore the report filters have no brand switch either.
  for (const tab of ['reminders', 'definitions', 'audit']) expect(pilot(tab), tab).not.toContain('aria-label="Marque"');
});
