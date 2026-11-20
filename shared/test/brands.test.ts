import {existsSync,readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import * as c from '../src/index.js';
const load=(f:string)=>JSON.parse(readFileSync(new URL('./fixtures/'+f,import.meta.url),'utf8')) as c.Product[];
const touche=load('catalogue.json'),bel=load('belnco.json');
const get=(id:string)=>bel.find(p=>p.id===id)!;

describe('brands',()=>{
 it('a missing or unknown brand is Touché',()=>{
  expect(c.brandOf(undefined)).toBe('touche');
  expect(c.brandOf(null)).toBe('touche');
  expect(c.brandOf({})).toBe('touche');
  expect(c.brandOf({brand:'shein'})).toBe('touche');
  expect(c.brandOf({brand:'belnco'})).toBe('belnco');
  expect(c.BRANDS).toEqual(['touche','belnco']);
  expect(c.BRAND_LABELS).toEqual({touche:'Touché',belnco:'BEL.NCO'});
  expect(c.BRAND_PREFIXES).toEqual({touche:'TOU',belnco:'BEL'});
  expect(['touche','belnco','shein',undefined].map(c.isBrand)).toEqual([true,true,false,false]);
  expect(touche.every(p=>c.brandOf(p)==='touche')).toBe(true);
 });
 it('lists the brands that have an enabled product, Touché first',()=>{
  expect(c.availableBrands(touche)).toEqual(['touche']);
  expect(c.availableBrands([...bel,...touche])).toEqual(['touche','belnco']);
  expect(c.availableBrands([...touche,...bel.map(p=>({...p,enabled:false}))])).toEqual(['touche']);
 });
});

describe('references by brand',()=>{
 it('the typed prefix decides the brand; a number alone takes the call’s brand',()=>{
  expect(c.parseBrandReference('BEL1763838','touche')).toEqual({reference:'BEL1763838',id:1763838,brand:'belnco'});
  expect(c.parseBrandReference(' bel 1763838 ','belnco')).toEqual({reference:'BEL1763838',id:1763838,brand:'belnco'});
  expect(c.parseBrandReference('1763838','belnco')).toEqual({reference:'BEL1763838',id:1763838,brand:'belnco'});
  expect(c.parseBrandReference('1763816','touche')).toEqual({reference:'TOU1763816',id:1763816,brand:'touche'});
  expect(c.parseBrandReference('TOU-1763816','belnco')).toEqual({reference:'TOU1763816',id:1763816,brand:'touche'});
  expect(c.parseBrandReference('#BEL01763838.','touche')).toEqual({reference:'BEL1763838',id:1763838,brand:'belnco'});
  for(const raw of ['DOS-0142','SHT1761073','BEL12',''])expect(c.parseBrandReference(raw,'belnco'),raw).toBeNull();
  expect(c.parseBrandReference('SHT1761073','touche',{touche:'SHT',belnco:'BEL'})).toEqual({reference:'SHT1761073',id:1761073,brand:'touche'});
 });
 it('a typed prefix names its brand as soon as it is complete',()=>{
  expect(c.referenceBrand('bel')).toBe('belnco');
  expect(c.referenceBrand('#TOU1')).toBe('touche');
  expect(c.referenceBrand('BE')).toBeNull();
  expect(c.referenceBrand('1763816')).toBeNull();
 });
 it('the hints name the call’s store',()=>{
  expect(c.orderReferenceHint('touche')).toBe(c.ORDER_REFERENCE_HINT);
  expect(c.orderReferenceHint('belnco')).toBe('Une référence commence par BEL suivie du numéro de commande, par exemple BEL1763838.');
  expect(c.referenceBrandMismatch('belnco','touche')).toBe('Cette référence est une commande BEL.NCO : l’appel est un appel Touché. Changez la marque de l’appel ou corrigez la référence.');
 });
});

describe('BEL.NCO catalogue data',()=>{
 it('holds the ten rows the spec fixes, in routine order',()=>{
  expect(bel.map(p=>[p.id,p.category,p.price,p.enabled])).toEqual([
   ['bel-oil','Nettoyant',1700,true],['bel-gel','Nettoyant',1700,true],['bel-spf30','Soin ciblé',1800,true],
   ['bel-clarifying','Soin ciblé',1900,true],['bel-retinol','Soin ciblé',1900,true],['bel-pear','Soin ciblé',4950,true],
   ['bel-moist','Hydratant',1650,true],['bel-uv50','Protection solaire',1650,true],['bel-tinted','Protection solaire',2400,false],
   ['bel-ritual','Pack',3100,true]]);
  for(const p of bel){
   expect(p).toMatchObject({brand:'belnco',domain:'face',review:'draft'});
   expect(p.source).toMatch(/^https:\/\/belnco\.com\/products\//);
   expect(p.inciText).toBeUndefined();
  }
  expect(get('bel-ritual').components).toEqual(['bel-oil','bel-gel']);
 });
 it('shows the photo committed for each product, served by the desk like the Touché photos',()=>{
  for(const p of bel){
   expect(p.image,p.id).toBe(`/assets/products/${p.id}.webp`);
   expect(existsSync(new URL('../../frontend/public'+p.image,import.meta.url)),p.image).toBe(true);
  }
 });
 it('gives the size read on each label',()=>{
  expect(Object.fromEntries(bel.map(p=>[p.id,p.size]))).toEqual({
   'bel-oil':'250 ml','bel-gel':'250 ml','bel-spf30':'30 ml','bel-clarifying':'30 ml','bel-retinol':'30 ml',
   'bel-pear':'30 ml','bel-moist':'50 ml','bel-uv50':'50 ml','bel-tinted':'30 ml','bel-ritual':'2 × 250 ml'});
 });
 it('only the retinol and the acid serum are evening-only, and they exclude each other',()=>{
  expect(bel.filter(p=>p.photosensitizing).map(p=>p.id)).toEqual(['bel-clarifying','bel-retinol']);
  expect(get('bel-retinol').excludes).toEqual(['bel-clarifying']);
  expect(get('bel-clarifying').excludes).toEqual(['bel-retinol']);
  for(const id of ['bel-retinol','bel-clarifying'])expect(get(id).cautions![0]).toBe('Soir uniquement / SPF le lendemain matin.');
 });
 it('the acid serum declares its tea tree essential oil (on its label)',()=>{
  expect(bel.filter(p=>p.essentialOils).map(p=>p.id)).toEqual(['bel-clarifying']);
 });
 it('only the retinol serum lists retinol or bakuchiol (the website copies them onto other pages)',()=>{
  for(const p of bel.filter(p=>p.id!=='bel-retinol'))expect(JSON.stringify(p.ingredients??[])).not.toMatch(/retinol|bakuchiol/i);
 });
});
