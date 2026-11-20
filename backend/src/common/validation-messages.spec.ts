import { ZodError } from 'zod';
import { describeIssues } from './validation-messages.js';
import { loginSchema, productActionSchema, saveCallSchema, userSchema } from '../desk/schemas.js';

const message = (run: () => unknown) => {
  try {
    run();
  } catch (error) {
    if (error instanceof ZodError) return describeIssues(error.issues);
    throw error;
  }
  throw new Error('expected a validation error');
};
const product = {
  id: 'produit-test',
  name: 'Produit test',
  short: 'Test',
  category: 'Hydratant',
  price: 1800,
  image: '/assets/products/test.webp',
  source: '',
  description: 'Description.',
  concerns: [],
  skins: [],
  active: true,
  size: '30 ml',
  enabled: true,
  recommendable: true,
  review: 'draft',
};

it('names the product image and source in French, without the technical path', () => {
  const text = message(() =>
    productActionSchema.parse({
      action: 'product',
      product: { ...product, image: 'https://evil.example/x.png', source: 'https://evil.example/' },
    }),
  );
  expect(text).toBe(
    'Vérifiez les champs du formulaire : Image du produit — adresse non autorisée, utilisez une image /assets/… ou une adresse https://cdn.shopify.com/… ; Fiche officielle — adresse non autorisée, utilisez une page https://www.touchelab.com/… ou https://belnco.com/….',
  );
  expect(text).not.toMatch(/product\.|Invalid|expected/);
});

it('explains lengths, missing fields and formats in French', () => {
  expect(
    message(() => userSchema.parse({ action: 'user', username: 'A!', label: 'x', password: '' })),
  ).toBe(
    'Vérifiez les champs du formulaire : Identifiant — 3 à 40 caractères : lettres minuscules, chiffres, point, tiret ou tiret bas ; Nom affiché — 2 caractères minimum.',
  );
  expect(message(() => loginSchema.parse({ action: 'login', password: 'x' }))).toBe(
    'Vérifiez les champs du formulaire : Identifiant — champ obligatoire.',
  );
  expect(
    message(() =>
      productActionSchema.parse({ action: 'product', product: { ...product, price: 18.5 } }),
    ),
  ).toBe('Vérifiez les champs du formulaire : Prix — nombre entier attendu.');
  expect(
    message(() =>
      productActionSchema.parse({ action: 'product', product: { ...product, price: 200000 } }),
    ),
  ).toBe('Vérifiez les champs du formulaire : Prix — maximum 100\u202f000.');
});

it('labels nested call fields and unknown request fields', () => {
  expect(message(() => saveCallSchema.parse({ action: 'save-call', id: 'x' }))).toMatch(
    /^Vérifiez les champs du formulaire : Identifiant technique — format non accepté ; Commande initiale — champ obligatoire\.$/,
  );
  expect(
    message(() => loginSchema.parse({ action: 'login', username: 'a', password: 'b', extra: 1 })),
  ).toBe('Vérifiez les champs du formulaire : Requête — champ non pris en charge.');
  expect(
    message(() =>
      saveCallSchema.parse({
        action: 'save-call',
        id: crypto.randomUUID(),
        baseId: 'antiacne',
        productIds: ['antiacne'],
        outcome: 'initial',
        tier: 'catalogue',
        delivery: null,
        consent: false,
        checked: false,
        refusal: '',
        quantities: { antiacne: 0 },
      }),
    ),
  ).toBe('Vérifiez les champs du formulaire : Quantités — minimum 1.');
});
