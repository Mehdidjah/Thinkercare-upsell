import {requestJson} from '../../data/api';

export function api(body?:unknown){return requestJson(body?'':'?compact=1',body);}
