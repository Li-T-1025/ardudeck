// Contract shared with the module SDK seam and the MCP tools: extend, never rename.

export type SetupVehicle = 'copter' | 'heli' | 'plane' | 'vtol' | 'rover' | 'boat' | 'sub';

export type SetupStepState = 'done' | 'found' | 'needs-pilot' | 'todo';

export interface SetupStepStatus {
  id: string;
  state: SetupStepState;
  titleKey: string;
  blockers: string[];
}

export interface SetupStatus {
  vehicle: SetupVehicle;
  firmware: string;
  steps: SetupStepStatus[];
  prearm: { text: string; stepId: string | null }[];
}

export interface SetupSuggestion {
  kind: 'tune' | 'airspeed' | 'battery';
  inputs: Record<string, number | string>;
  changes: { name: string; value: number; reason: string }[];
  source: string;
}

export type SetupStepId =
  | 'size' | 'frame' | 'orient' | 'radio' | 'compass' | 'modes' | 'motors' | 'battery' | 'ready'
  | 'psize' | 'power' | 'extras' | 'launch' | 'soar' | 'airframe' | 'outputs' | 'surfaces' | 'thrcheck' | 'airspeed'
  | 'vtype' | 'vframe' | 'assist'
  | 'drive' | 'drivetest' | 'motordrv' | 'windvane'
  | 'water' | 'leak' | 'subframe' | 'thrusters' | 'joystick';

/** Current parameter value by name, undefined when the board does not have it. */
export type ParamReader = (name: string) => number | undefined;

export type CopterClass = 'quad' | 'hexa' | 'octa' | 'x8' | 'y6' | 'dodeca' | 'tri' | 'deca' | 'single' | 'coax' | 'bi';
export type VtolType = 'quad' | 'tilt' | 'tail';
export type TailsitterKind = 'dual' | 'single' | 'copter';
export type Airframe = 'normal' | 'three' | 'wing' | 'vtail' | 'invv' | 'none';
export type PlanePower = 'electric' | 'twin' | 'ic' | 'glider';
export type PlaneExtra = 'flaps' | 'flaperon' | 'airbrake' | 'spoiler' | 'steer' | 'gear';
export type RoverDrive = 'steer' | 'skid' | 'omni' | 'balance';
export type BoatDrive = 'rudder' | 'diff' | 'vector' | 'sail';
export type Chemistry = 'lipo' | 'lipohv' | 'liion';

/** What the pilot told the wizard. Anything the board already reports is never stored here. */
export interface SetupAnswers {
  copterClass?: CopterClass;
  /** FRAME_TYPE / Q_FRAME_TYPE value of the picked layout. */
  frameType?: number;
  vtolType?: VtolType;
  tailsitter?: TailsitterKind;
  airframe?: Airframe;
  power?: PlanePower;
  extras?: PlaneExtra[];
  /** Two aileron servos on one output (Y-cable) or one output each. */
  aileronY?: boolean;
  drive?: RoverDrive | BoatDrive;
  /** Single-choice answers keyed by step id (launch, water...), plus sub-picks such as omniType or leakPin. */
  choices?: Record<string, string>;
  propIn?: number;
  frameMm?: number;
  cells?: number;
  chemistry?: Chemistry;
  capacity?: number;
  spanMm?: number;
  rootMm?: number;
  tipMm?: number;
  massG?: number;
  /** The pilot's own stall speed, used instead of the estimate. */
  stall?: number;
}
