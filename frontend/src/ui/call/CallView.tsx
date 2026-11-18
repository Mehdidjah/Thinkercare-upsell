import {useCall} from './callModel';
import {CallHeading} from './CallHeading';
import {CallContextPanel} from './CallContextPanel';
import {StepNav} from './StepNav';
import {StepOrder} from './StepOrder';
import {StepNeeds} from './StepNeeds';
import {StepRoutine} from './StepRoutine';
import {RoutineRail} from './RoutineRail';

/** Guided call: heading, call context, step navigation, the current step and the live routine rail. */
export function CallView(){const {step,base}=useCall();
 return <><CallHeading/>
 <CallContextPanel/>
 <StepNav/>
 <div className="call-layout"><section className="notebook">
 {step===0&&<StepOrder/>}
 {step===1&&<StepNeeds/>}
 {step===2&&base&&<StepRoutine base={base}/>}
 </section>
 <RoutineRail/></div></>;
}
