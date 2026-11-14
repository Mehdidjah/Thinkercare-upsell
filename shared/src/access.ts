// Shared server policy, independently tested. User-supplied filters may only narrow this scope.
export type ReportingUser={id:string;role:string;team?:string;reporting_scope?:string};
// userId null = unrestricted (admin); otherwise rows are limited to that user.
export function reportScope(user:ReportingUser):{userId:string|null}{
 if(user.role==='admin')return{userId:null};
 // Legacy team reporting flag never grants a non-admin access to colleagues.
 return{userId:user.id};
}
