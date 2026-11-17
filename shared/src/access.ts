// Shared server policy, independently tested. User-supplied filters may only narrow this scope.
export type ReportingUser={id:string;role:string;team?:string;reporting_scope?:string};
export const canManageWorkspace=(user:{role:string})=>user.role==='admin'||user.role==='manager';
export const accountRoleLabel=(role:string)=>role==='admin'?'Direction':role==='manager'?'Manager':'Conseillère';
export function canManageAccount(actor:{role:string},target:{role:string}):boolean{
 return canManageWorkspace(actor)&&(actor.role==='admin'||target.role!=='admin');
}
export function canRemoveAccount(actor:{id:string;role:string},target:{id:string;role:string}):boolean{
 return canManageAccount(actor,target)&&target.role!=='admin'&&actor.id!==target.id;
}
// userId null = unrestricted management reporting; otherwise rows are limited to that user.
export function reportScope(user:ReportingUser):{userId:string|null}{
 if(canManageWorkspace(user))return{userId:null};
 // A legacy team flag never grants an advisor access to colleagues.
 return{userId:user.id};
}
