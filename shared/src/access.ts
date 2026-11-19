// Shared server policy, independently tested. User-supplied filters may only narrow this scope.
export type ReportingUser={id:string;role:string;team?:string;reporting_scope?:string};
export const canManageWorkspace=(user:{role:string})=>user.role==='admin'||user.role==='manager';
export type MemberRole='advisor'|'cm'|'manager';
export const MEMBER_ROLES:readonly(readonly [MemberRole,string])[]=[['advisor','Call center'],['cm','CM'],['manager','Manager']];
// Frontline roles share the call-center rights: own data only, no management.
export const isFrontline=(role:string)=>role==='advisor'||role==='cm';
export const accountRoleLabel=(role:string)=>role==='admin'?'Direction':role==='manager'?'Manager':role==='cm'?'CM':'Call center';
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
