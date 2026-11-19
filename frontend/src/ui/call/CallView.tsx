import {useCall} from './callModel';
import {CallHeading} from './CallHeading';
import {CallContextPanel} from './CallContextPanel';
import {StepNav} from './StepNav';
import {StepOrder} from './StepOrder';
import {StepNeeds} from './StepNeeds';
import {StepRoutine} from './StepRoutine';
import {RoutineRail} from './RoutineRail';

/** Guided call: step navigation, heading, call context and the current step, beside the live routine rail. */
export function CallView(){const {step,base}=useCall();
 return <div className="call-layout">
  <div className="call-notebook">
   <StepNav/>
   <CallHeading/>
   <CallContextPanel/>
   {step===0&&<StepOrder/>}
   {step===1&&<StepNeeds/>}
   {step===2&&base&&<StepRoutine base={base}/>}
  </div>
  <RoutineRail/>
 </div>;
}
