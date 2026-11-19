import assert from 'node:assert/strict';
import {test} from 'vitest';
import * as a from '../src/index.js';
test('isFrontline is advisor and cm only',()=>{for(const r of ['advisor','cm'])assert.equal(a.isFrontline(r),true);for(const r of ['admin','manager','','CM'])assert.equal(a.isFrontline(r),false)});
test('Role labels',()=>{for(const [r,l] of [['admin','Direction'],['manager','Manager'],['advisor','Call center'],['cm','CM'],['unknown','Call center']])assert.equal(a.accountRoleLabel(r),l)});
test('Member roles',()=>{assert.deepEqual(a.MEMBER_ROLES.map(r=>r[0]),['advisor','cm','manager']);assert.deepEqual(a.MEMBER_ROLES.map(r=>r[1]),['Call center','CM','Manager'])});
test('cm has no workspace rights and is scoped to self',()=>{assert.equal(a.canManageWorkspace({role:'cm'}),false);assert.deepEqual(a.reportScope({id:'u1',role:'cm',reporting_scope:'team'}),{userId:'u1'})});
