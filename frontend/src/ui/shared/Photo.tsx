import {type Product} from '@touche/domain';
import {Icon} from './Icon';

export function Photo({product,small=false}:{product:Product;small?:boolean}){
 return <div className={'photo'+(small?' photo--sm':'')}>{product.image
  ?<img src={product.image} alt={product.name} loading="lazy"/>
  :<div className="photo__empty"><Icon name="grid"/><span>Visuel à confirmer</span></div>}</div>;
}
