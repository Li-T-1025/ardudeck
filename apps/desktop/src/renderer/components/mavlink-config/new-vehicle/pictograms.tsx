import type { ReactNode } from 'react';
import {
  BatteryFull, CircleOff, Cpu, Droplet, Gamepad2, Gauge, Hand, ListChecks, Network, Plug, Radio, Satellite, ToggleRight, Wand2, Waves, Wind, Wrench, Zap, ArrowLeftRight,
} from 'lucide-react';

// Top-down line drawings, nose or bow up. The part an option is about is drawn in the accent.
const A = ({ children }: { children: ReactNode }) => <g className="text-sky-500" strokeWidth={2.4}>{children}</g>;

function Svg({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 48 48" width={52} height={52} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const Lucide = ({ icon: I, accent }: { icon: typeof Hand; accent?: boolean }) => (
  <div className={`flex h-[52px] w-[52px] items-center justify-center ${accent ? 'text-sky-500' : ''}`}><I className="h-8 w-8" strokeWidth={1.6} /></div>
);

const HULL = 'M24 4 C31 10 33 18 33 26 L33 41 L15 41 L15 26 C15 18 17 10 24 4 Z';
const FUSE = 'M24 5 C26 7 26 10 26 14 L25.5 40 L22.5 40 L22 14 C22 10 22 7 24 5 Z';
const Plane = ({ wing = true, tail = true }: { wing?: boolean; tail?: boolean }) => (
  <>
    <path d={FUSE} />
    {wing && <path d="M5 18 L22 16 L26 16 L43 18 L43 22 L5 22 Z" />}
    {tail && <path d="M16 37 L32 37 L32 40 L16 40 Z" />}
  </>
);
const Car = () => <rect x={16} y={8} width={16} height={32} rx={3} />;
const Wheel = ({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) => <rect x={x - 2} y={y - 4} width={4} height={8} rx={1} transform={`rotate(${rot} ${x} ${y})`} />;
const ROV = () => <rect x={13} y={8} width={22} height={32} rx={4} />;
const Thr = ({ x, y, rot = 0 }: { x: number; y: number; rot?: number }) => <rect x={x - 1.5} y={y - 3.5} width={3} height={7} rx={1} transform={`rotate(${rot} ${x} ${y})`} />;
const Vert = ({ x, y }: { x: number; y: number }) => <circle cx={x} cy={y} r={3} />;

const P: Record<string, () => ReactNode> = {
  // boat drive
  'driveBoat.rudder': () => <Svg><path d={HULL} /><circle cx={24} cy={38} r={2} /><A><path d="M24 42 L26.5 47" /></A></Svg>,
  'driveBoat.diff': () => <Svg><path d={HULL} /><A><circle cx={19} cy={38} r={2} /><circle cx={29} cy={38} r={2} /><path d="M19 42 V47 M29 42 V44.5" /></A></Svg>,
  'driveBoat.vector': () => <Svg><path d={HULL} /><A><path d="M24 39 L28 46" /><path d="M26 47 L30 45" /></A></Svg>,
  'driveBoat.sail': () => <Svg><path d={HULL} /><circle cx={24} cy={16} r={1.5} /><A><path d="M24 16 Q33 24 29 37" /></A></Svg>,
  // rover drive
  'driveRover.steer': () => <Svg><Car /><Wheel x={36} y={34} /><Wheel x={12} y={34} /><A><Wheel x={12} y={14} rot={-20} /><Wheel x={36} y={14} rot={-20} /></A></Svg>,
  'driveRover.skid': () => <Svg><Car /><A><rect x={8} y={8} width={5} height={32} rx={1.5} /><rect x={35} y={8} width={5} height={32} rx={1.5} /><path d="M10.5 4 V7 M37.5 41 V45" /></A></Svg>,
  'driveRover.omni': () => <Svg><Car /><A><Wheel x={12} y={14} rot={45} /><Wheel x={36} y={14} rot={-45} /><Wheel x={12} y={34} rot={-45} /><Wheel x={36} y={34} rot={45} /></A><path d="M6 24 H2 M42 24 H46" /></Svg>,
  'driveRover.balance': () => <Svg><rect x={18} y={12} width={12} height={24} rx={3} /><A><rect x={11} y={18} width={5} height={12} rx={1.5} /><rect x={32} y={18} width={5} height={12} rx={1.5} /></A></Svg>,
  // plane airframes
  'airframe.normal': () => <Svg><Plane /><A><path d="M6 22 H14 M34 22 H42 M17 40 H31" /></A></Svg>,
  'airframe.three': () => <Svg><Plane /><A><path d="M24 34 V44" /></A></Svg>,
  'airframe.wing': () => <Svg><path d="M24 8 L44 32 L40 37 L8 37 L4 32 Z" /><A><path d="M9 37 H20 M28 37 H39" /></A></Svg>,
  'airframe.vtail': () => <Svg><Plane tail={false} /><A><path d="M24 36 L15 43 M24 36 L33 43" /></A></Svg>,
  'airframe.invv': () => <Svg><path d="M5 18 L43 18 L43 22 L5 22 Z" /><path d="M16 22 V40 M32 22 V40 M22 10 H26 V18 H22 Z" /><A><path d="M16 40 L24 35 L32 40" /></A></Svg>,
  'airframeTail.wing': () => <Svg><path d="M24 8 L44 32 L40 37 L8 37 L4 32 Z" /><A><path d="M9 37 H20 M28 37 H39" /></A></Svg>,
  'airframeTail.none': () => <Svg><path d="M24 8 L44 32 L40 37 L8 37 L4 32 Z" /><A><path d="M10 16 H20 M28 16 H38" /></A></Svg>,
  // power
  'power.electric': () => <Svg><Plane /><A><path d="M18 4 H30" /></A></Svg>,
  'power.twin': () => <Svg><Plane /><A><path d="M10 14 H20 M28 14 H38" /></A></Svg>,
  'power.ic': () => <Svg><Plane /><A><rect x={20.5} y={7} width={7} height={6} rx={1} /><path d="M18 4 H30" /></A></Svg>,
  'power.glider': () => <Svg><path d={FUSE} /><A><path d="M2 19 L22 17 L26 17 L46 19 L46 21 L2 21 Z" /></A><path d="M18 37 H30 V39 H18 Z" /></Svg>,
  // extras
  'extras.flaps': () => <Svg><Plane /><A><path d="M14 22 H21 M27 22 H34" /></A></Svg>,
  'extras.flaperon': () => <Svg><Plane /><A><path d="M6 22 H21 M27 22 H42" /></A></Svg>,
  'extras.airbrake': () => <Svg><Plane /><A><path d="M14 19 V15 M17 19 V15 M31 19 V15 M34 19 V15" /></A></Svg>,
  'extras.spoiler': () => <Svg><Plane /><A><path d="M10 19.5 H19 M29 19.5 H38" /></A></Svg>,
  'extras.steer': () => <Svg><Plane /><A><Wheel x={24} y={9} rot={-25} /></A></Svg>,
  'extras.gear': () => <Svg><Plane /><A><circle cx={24} cy={9} r={2} /><circle cx={17} cy={25} r={2} /><circle cx={31} cy={25} r={2} /></A></Svg>,
  // take-off
  'launch.hand': () => <Lucide icon={Hand} accent />,
  'launch.bungee': () => <Svg><Plane /><A><path d="M24 4 L24 2 M24 2 L21 0 M24 44 L20 46 L28 48" /></A><path d="M24 44 V46" /></Svg>,
  'launch.cat': () => <Svg><Plane /><A><path d="M24 46 V30 M20 46 H28 M24 2 L20 6 M24 2 L28 6" /></A></Svg>,
  'launch.runway': () => <Svg><path d="M10 2 V46 M38 2 V46" /><A><path d="M24 4 V10 M24 16 V22 M24 28 V34 M24 40 V46" /></A></Svg>,
  'launch.tdrag': () => <Svg><Plane /><circle cx={17} cy={14} r={2} /><circle cx={31} cy={14} r={2} /><A><circle cx={24} cy={43} r={2} /></A></Svg>,
  'launch.belly': () => <Svg><Plane /><A><path d="M4 46 Q8 43 12 46 T20 46 T28 46 T36 46 T44 46" /></A></Svg>,
  // soaring
  'soar.yes': () => <Svg><path d="M18 24 L22 23 L26 23 L30 24" /><A><path d="M24 44 C14 40 12 30 24 30 C34 30 34 38 24 38 C18 38 18 34 24 34" /></A></Svg>,
  'soar.no': () => <Svg><Plane /></Svg>,
  // airspeed
  'airspeed.none': () => <Lucide icon={Satellite} />,
  'airspeed.i2c': () => <Svg><rect x={20} y={20} width={14} height={10} rx={2} /><A><path d="M6 25 H20 M6 22 V28" /></A><path d="M34 25 H42" /></Svg>,
  'airspeed.can': () => <Lucide icon={Network} accent />,
  // VTOL types
  'vtype.quad': () => <Svg><Plane /><A><circle cx={10} cy={10} r={4} /><circle cx={38} cy={10} r={4} /><circle cx={10} cy={30} r={4} /><circle cx={38} cy={30} r={4} /></A></Svg>,
  'vtype.tilt': () => <Svg><Plane /><A><circle cx={12} cy={12} r={4} /><circle cx={36} cy={12} r={4} /><path d="M12 6 L15 3 M36 6 L33 3" /></A></Svg>,
  'vtype.tail': () => <Svg><path d="M6 30 H42 M24 8 V40 M18 40 H30" /><A><path d="M14 6 H22 M26 6 H34" /></A></Svg>,
  'tailsitter.dual': () => <Svg><path d="M24 8 L44 32 L40 37 L8 37 L4 32 Z" /><A><path d="M10 18 H20 M28 18 H38" /></A></Svg>,
  'tailsitter.single': () => <Svg><path d="M24 8 L44 32 L40 37 L8 37 L4 32 Z" /><A><path d="M18 5 H30" /></A></Svg>,
  'tailsitter.copter': () => <Svg><path d="M24 8 L44 32 L40 37 L8 37 L4 32 Z" /><A><circle cx={10} cy={14} r={4} /><circle cx={38} cy={14} r={4} /><circle cx={10} cy={40} r={4} /><circle cx={38} cy={40} r={4} /></A></Svg>,
  // VTOL assist
  'assist.off': () => <Svg><Plane /></Svg>,
  'assist.on': () => <Svg><Plane /><A><circle cx={10} cy={10} r={4} strokeDasharray="2 2" /><circle cx={38} cy={10} r={4} strokeDasharray="2 2" /><circle cx={10} cy={30} r={4} strokeDasharray="2 2" /><circle cx={38} cy={30} r={4} strokeDasharray="2 2" /></A></Svg>,
  // motor driver
  'motordrv.esc': () => <Lucide icon={Zap} accent />,
  'motordrv.relay': () => <Lucide icon={ToggleRight} accent />,
  'motordrv.bipolar': () => <Lucide icon={ArrowLeftRight} accent />,
  // wind vane
  'windvane.nmea': () => <Lucide icon={Wind} accent />,
  'windvane.analog': () => <Svg><path d="M24 24 V44" /><A><path d="M10 24 H36 M36 24 L32 20 M36 24 L32 28 M10 20 L14 24 L10 28" /></A></Svg>,
  'windvane.none': () => <Lucide icon={CircleOff} />,
  // sub frames: rectangle hull, angled horizontal thrusters, circles for vertical ones
  'subframe.1': () => <Svg><ROV /><A><Thr x={11} y={10} rot={45} /><Thr x={37} y={10} rot={-45} /><Thr x={11} y={38} rot={-45} /><Thr x={37} y={38} rot={45} /><Vert x={18} y={24} /><Vert x={30} y={24} /></A></Svg>,
  'subframe.2': () => <Svg><ROV /><A><Thr x={11} y={10} rot={45} /><Thr x={37} y={10} rot={-45} /><Thr x={11} y={38} rot={-45} /><Thr x={37} y={38} rot={45} /><Vert x={18} y={16} /><Vert x={30} y={16} /><Vert x={18} y={32} /><Vert x={30} y={32} /></A></Svg>,
  'subframe.3': () => <Svg><ROV /><A><Thr x={11} y={10} /><Thr x={37} y={10} /><Thr x={11} y={38} /><Thr x={37} y={38} /><Vert x={18} y={16} /><Vert x={30} y={16} /><Vert x={18} y={32} /><Vert x={30} y={32} /></A></Svg>,
  'subframe.0': () => <Svg><ROV /><A><Thr x={11} y={34} /><Thr x={37} y={34} /><Thr x={24} y={40} rot={90} /><Vert x={18} y={14} /><Vert x={30} y={14} /><Vert x={24} y={28} /></A></Svg>,
  'subframe.4': () => <Svg><ROV /><A><Thr x={11} y={34} /><Thr x={37} y={34} /><Vert x={24} y={20} /></A></Svg>,
  'subframe.5': () => <Svg><ROV /><A><Thr x={11} y={34} /><Thr x={37} y={34} /><Vert x={18} y={18} /><Vert x={30} y={18} /></A></Svg>,
  'subframe.6': () => <Svg><ROV /><A><Thr x={11} y={34} /><Thr x={37} y={34} /><Vert x={18} y={18} /><Vert x={30} y={18} /><Thr x={24} y={42} rot={90} /></A></Svg>,
  'subframe.7': () => <Lucide icon={Wrench} />,
  // thrusters, water, leak, control
  'thrusters.auto': () => <Lucide icon={Wand2} accent />,
  'thrusters.manual': () => <Lucide icon={ListChecks} accent />,
  'water.fresh': () => <Lucide icon={Droplet} accent />,
  'water.salt': () => <Lucide icon={Waves} accent />,
  'leak.nav': () => <Lucide icon={Cpu} accent />,
  'leak.aux': () => <Lucide icon={Plug} accent />,
  'leak.none': () => <Lucide icon={CircleOff} />,
  'joystick.pad': () => <Lucide icon={Gamepad2} accent />,
  'joystick.rc': () => <Lucide icon={Radio} accent />,
  // aileron wiring: one output split by a Y-cable, or one output per servo
  'aileron.y': () => <Svg><path d="M6 24 H20" /><A><path d="M20 24 L34 12 M20 24 L34 36" /></A><rect x={34} y={9} width={8} height={6} rx={1} /><rect x={34} y={33} width={8} height={6} rx={1} /></Svg>,
  'aileron.two': () => <Svg><A><path d="M6 12 H34 M6 36 H34" /></A><rect x={34} y={9} width={8} height={6} rx={1} /><rect x={34} y={33} width={8} height={6} rx={1} /></Svg>,
  // battery monitor
  'monitor.4': () => <Lucide icon={Gauge} accent />,
  'monitor.3': () => <Lucide icon={Zap} accent />,
  'monitor.8': () => <Lucide icon={BatteryFull} accent />,
  'monitor.9': () => <Lucide icon={Cpu} accent />,
};

export const PICTOGRAM_IDS = Object.keys(P);

/** Pictogram for an option card, or null when the option has none. */
export function Pictogram({ id }: { id: string }) {
  const draw = P[id];
  return draw ? <>{draw()}</> : null;
}

export type OptionTag = 'recommended' | 'unverified' | 'caution';

/** Tags that carry meaning: green for the usual safe pick, amber where the path is unverified or risky. */
export const OPTION_TAGS: Record<string, OptionTag> = {
  'power.glider': 'unverified',
  'subframe.7': 'unverified',
  'assist.off': 'recommended',
  'aileron.y': 'recommended',
  'thrusters.auto': 'recommended',
  'leak.none': 'caution',
  'windvane.none': 'caution',
  'joystick.pad': 'recommended',
  'motordrv.esc': 'recommended',
};
