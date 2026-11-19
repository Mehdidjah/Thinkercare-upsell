import assert from 'node:assert/strict';
import {test} from 'vitest';
import * as c from '../src/index.js';

const answered:c.Profile={...c.EMPTY_PROFILE,concerns:['acne'],skin:'mixed',sensitive:'no',routineKnown:true,routine:['Nettoyant'],safety:['none'],severity:'mild'};

test('Re-tapping an answer that is already selected changes nothing',()=>{
 assert.equal(c.profileChanges(answered,{skin:'mixed'}),false);
 assert.equal(c.profileChanges(answered,{sensitive:'no',severity:'mild'}),false);
 assert.equal(c.profileChanges(answered,{routine:['Nettoyant'],routineKnown:true}),false);
 assert.equal(c.profileChanges(answered,{safety:['none']}),false);
 assert.equal(c.profileChanges(answered,{}),false);
});
test('A different answer is a change',()=>{
 assert.equal(c.profileChanges(answered,{skin:'oily'}),true);
 assert.equal(c.profileChanges(answered,{routine:['Nettoyant','Hydratant']}),true);
 assert.equal(c.profileChanges(answered,{safety:['allergy']}),true);
 assert.equal(c.profileChanges(answered,{allergens:['fragrance']}),true);
 assert.equal(c.profileChanges(answered,{skin:'mixed',severity:'severe'}),true);
});
test('List answers compare by content and order, not by reference',()=>{
 assert.equal(c.profileChanges(answered,{routine:[...answered.routine]}),false);
 assert.equal(c.profileChanges({...answered,concerns:['acne','marks']},{concerns:['marks','acne']}),true);
});
