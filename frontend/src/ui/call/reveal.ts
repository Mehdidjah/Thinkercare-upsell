/** Smooth scrolling only when the system does not ask to reduce motion (E6, CONFIRMBOX). */
export function scrollBehavior():ScrollBehavior{
 try{return window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth';}catch{return 'auto';}
}

/** Brings an element into view and moves keyboard focus to it (or to `target` inside it), without a second jump (E6,
 *  CONFIRMBOX). A section or a heading gets tabindex="-1" so it can hold focus without entering the tab order. */
export function reveal(el:HTMLElement|null|undefined,block:ScrollLogicalPosition='center',target:HTMLElement|null=el??null){
 if(!el)return;
 el.scrollIntoView({behavior:scrollBehavior(),block});
 if(!target)return;
 if(!target.hasAttribute('tabindex')&&!target.matches('a[href],button,input,select,textarea'))target.setAttribute('tabindex','-1');
 target.focus({preventScroll:true});
}

/** After a re-render: focus the element the selector names, if it is still there. */
export function focusLater(selector:string){requestAnimationFrame(()=>document.querySelector<HTMLElement>(selector)?.focus());}
