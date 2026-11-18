export const CATS=['Tous','Soin ciblé','Hydratant','Sérum hydratant','Nettoyant','Protection solaire','Shampoing','Après-shampoing','Soin cuir chevelu','Nettoyant corps','Soin local','Pack'];
export const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
