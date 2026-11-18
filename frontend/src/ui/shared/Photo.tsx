import {type Product} from '@touche/domain';
import {Icon} from './Icon';

export function Photo({product,small=false}:{product:Product;small?:boolean}){return <div className={'product-photo'+(small?' small':'')}>{product.image?<img src={product.image} alt={product.name} loading="lazy"/>:<div className="photo-empty"><Icon name="grid" size={32}/><span>Visuel à confirmer</span></div>}</div>;}
