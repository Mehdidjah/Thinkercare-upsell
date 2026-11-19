import type { z } from 'zod';

/** Form-field names as the desk shows them; a technical path is never shown to the user. */
const LABELS: Record<string, string> = {
  action: 'Action',
  id: 'Identifiant technique',
  username: 'Identifiant',
  password: 'Mot de passe',
  current: 'Mot de passe actuel',
  next: 'Nouveau mot de passe',
  adminPassword: 'Votre mot de passe',
  label: 'Nom affiché',
  team: 'Équipe',
  role: 'Rôle',
  active: 'Accès actif',
  reporting_scope: 'Périmètre de suivi',
  validated: 'Validation du protocole',
  by: 'Responsable de la validation',
  month: 'Mois',
  threshold: 'Seuil',
  rateDzd: 'Montant par upsell',
  mode: 'Mode de calcul',
  expectedVersion: 'Version de la règle',
  confirmed: 'Confirmation',
  reason: 'Motif de l’annulation',
  callId: 'Appel',
  baseId: 'Commande initiale',
  baseIds: 'Commande initiale',
  baseQuantities: 'Quantités de la commande initiale',
  quantities: 'Quantités',
  upgradeId: 'Pack de remplacement',
  productIds: 'Produits de l’offre',
  tier: 'Niveau de prix',
  delivery: 'Livraison',
  agreedTotal: 'Montant annoncé',
  verifiedProducts: 'Vérifications spécifiques',
  outcome: 'Résultat de l’appel',
  consent: 'Accord de la cliente',
  checked: 'Vérification de compatibilité',
  refusal: 'Motif du refus',
  meta: 'Contexte de l’appel',
  'meta.version': 'Version du contexte',
  'meta.source': 'Source du contexte',
  'meta.customerStage': 'Type de cliente',
  'meta.orderRef': 'Référence du dossier',
  'meta.startedAt': 'Début de l’appel',
  'meta.eligible': 'Éligibilité',
  'meta.acceptedProposalId': 'Offre présentée',
  'meta.objections': 'Objections',
  'meta.callbackAt': 'Date du rappel',
  'meta.linkedCallId': 'Appel lié',
  product: 'Fiche produit',
  'product.id': 'Référence du produit',
  'product.name': 'Nom du produit',
  'product.short': 'Nom court',
  'product.category': 'Catégorie',
  'product.price': 'Prix',
  'product.image': 'Image du produit',
  'product.source': 'Fiche officielle',
  'product.description': 'Description',
  'product.concerns': 'Besoins couverts',
  'product.skins': 'Types de peau',
  'product.active': 'Produit actif',
  'product.size': 'Contenance',
  'product.enabled': 'Disponibilité',
  'product.recommendable': 'Suggestion automatique',
  'product.review': 'Relecture',
  'product.priceSource': 'Source du prix',
  'product.domain': 'Domaine',
  'product.components': 'Composants du pack',
  'product.ingredients': 'Ingrédients',
  'product.inciText': 'Liste INCI',
  'product.formulaNote': 'Note de formule',
  'product.checkedAt': 'Date de vérification',
  'product.pitch': 'Argumentaire',
  'product.usage': 'Conseils d’utilisation',
  'product.cautions': 'Précautions',
  'product.fragrance': 'Parfum',
  'product.essentialOils': 'Huiles essentielles',
  'product.gentle': 'Formule douce',
  'product.exfoliant': 'Exfoliant',
  'product.verificationRequired': 'Vérification requise',
};

/** What to enter instead, for fields whose format the generic message cannot explain. */
const HINTS: Record<string, string> = {
  username: '3 à 40 caractères : lettres minuscules, chiffres, point, tiret ou tiret bas',
  'product.id': '2 à 60 caractères : lettres minuscules, chiffres, tiret ou tiret bas',
  'product.components':
    'références de 2 à 60 caractères : lettres minuscules, chiffres, tiret ou tiret bas',
  'product.image':
    'adresse non autorisée, utilisez une image /assets/… ou une adresse https://cdn.shopify.com/…',
  'product.source': 'adresse non autorisée, utilisez une page https://www.touchelab.com/…',
  'meta.orderRef': 'lettres, chiffres et les signes . _ # - uniquement',
  month: 'choisissez un mois valide',
};

const EXPECTED: Record<string, string> = {
  int: 'nombre entier attendu',
  number: 'nombre attendu',
  string: 'texte attendu',
  boolean: 'oui ou non attendu',
  array: 'liste attendue',
  object: 'données attendues',
  record: 'données attendues',
};

const FR_NUMBER = new Intl.NumberFormat('fr-FR');
const count = (n: number | bigint) => FR_NUMBER.format(n);
const plural = (n: number | bigint, word: string) =>
  `${count(n)} ${word}${Number(n) > 1 ? 's' : ''}`;

/** Global Zod error map: short French phrases, completed by the field label in describeIssues. */
export const frenchIssue: z.core.$ZodErrorMap = (iss) => {
  switch (iss.code) {
    case 'invalid_type':
      return iss.input === undefined || iss.input === null
        ? 'champ obligatoire'
        : (EXPECTED[iss.expected] ?? 'format inattendu');
    case 'too_small':
      if (iss.origin === 'string') {
        return Number(iss.minimum) <= 1
          ? 'champ obligatoire'
          : `${plural(iss.minimum, 'caractère')} minimum`;
      }
      if (iss.origin === 'array' || iss.origin === 'set')
        return `${plural(iss.minimum, 'élément')} minimum`;
      return iss.inclusive === false
        ? `supérieur à ${count(iss.minimum)} attendu`
        : `minimum ${count(iss.minimum)}`;
    case 'too_big':
      if (iss.origin === 'string') return `${plural(iss.maximum, 'caractère')} maximum`;
      if (iss.origin === 'array' || iss.origin === 'set')
        return `${plural(iss.maximum, 'élément')} maximum`;
      return iss.inclusive === false
        ? `inférieur à ${count(iss.maximum)} attendu`
        : `maximum ${count(iss.maximum)}`;
    case 'invalid_format':
    case 'invalid_union':
      return 'format non accepté';
    case 'invalid_value':
      return 'choix non reconnu';
    case 'invalid_key':
      return 'référence non reconnue';
    case 'unrecognized_keys':
      return 'champ non pris en charge';
    case 'custom':
      return 'valeur non acceptée';
    default:
      return undefined;
  }
};

/** French description of the first validation problems, with the field label and never the raw path. */
export function describeIssues(issues: readonly z.core.$ZodIssue[]): string {
  const parts = issues.slice(0, 2).map((issue) => {
    const names = issue.path.filter((p): p is string => typeof p === 'string');
    let key = '';
    let label: string | undefined;
    for (let n = names.length; n > 0 && !label; n--) {
      key = names.slice(0, n).join('.');
      label = LABELS[key];
    }
    if (!names.length && issue.code === 'unrecognized_keys') label = 'Requête';
    const hinted = ['custom', 'invalid_format', 'invalid_key'].includes(issue.code)
      ? HINTS[key]
      : undefined;
    return `${label ?? 'Un champ'} — ${(hinted ?? issue.message).replace(/\.$/, '')}`;
  });
  return 'Vérifiez les champs du formulaire : ' + parts.join(' ; ') + '.';
}
