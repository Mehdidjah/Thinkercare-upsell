import {type Product} from '@touche/domain';
import {Icon} from './Icon';

/** Product photo. Decorative by default (X12): the name is always written beside it, so screen readers would read it
 *  twice. Only the product sheet passes the name as `alt`. */
export function Photo({product,small=false,alt=''}:{product:Product;small?:boolean;alt?:string}){
 return <div className={'photo'+(small?' photo--sm':'')}>{product.image
  ?<img src={product.image} alt={alt} loading="lazy"/>
  :<div className="photo__empty" aria-hidden={alt?undefined:true}><Icon name="grid"/><span>Visuel à confirmer</span></div>}</div>;
}
