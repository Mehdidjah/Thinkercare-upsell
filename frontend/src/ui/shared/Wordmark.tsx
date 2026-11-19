/** The ThinkerCare text wordmark (§1.3): « Thinker » at 600, « Care » at 400, never teal, never in capitals.
 *  Two adjacent spans with no space between them, so screen readers say "ThinkerCare". */
export function Wordmark({size='md'}:{size?:'sm'|'md'|'phone'|'lg'}){
 return <span className={`wordmark wordmark--${size}`}><span className="wordmark__thinker">Thinker</span><span className="wordmark__care">Care</span></span>;
}
