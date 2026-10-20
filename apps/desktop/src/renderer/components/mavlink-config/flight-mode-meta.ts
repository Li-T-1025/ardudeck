/**
 * Icon, description and "safe for a beginner" flag per ArduPilot mode number.
 * The mode NUMBERS and NAMES come from vehicle-core, the single source the
 * telemetry, the radio HUD and the link service already use; this file only
 * decorates them. A mode vehicle-core knows but this table does not still
 * renders, with a generic icon and description, so the two can never drift
 * into "Unknown" again (issue #147: Rover 4.7 Dock and Circle).
 */
import type React from 'react';
import {
  Activity, AlertTriangle, Anchor, Circle, Dumbbell, Fan, Gamepad2, Hand, HelpCircle, Home, Lock, Map, Move, Navigation,
  Octagon, Pin, Plane, PlaneLanding, Rocket, RotateCcw, Ruler, Users, Wind, Wrench, Zap,
} from 'lucide-react';
import { COPTER_MODES, PLANE_MODES, ROVER_MODES } from '../../../shared/telemetry-types';

export type VehicleCategory = 'copter' | 'plane' | 'rover';

export interface ModeMeta {
  descriptionKey: string;
  icon: React.ElementType;
  safe: boolean;
}

export interface ModeInfo extends ModeMeta {
  name: string;
}

const D = 'mavlink-config:flightModesTab.modeDesc';

export const FALLBACK_META: ModeMeta = { descriptionKey: `${D}.noDescription`, icon: HelpCircle, safe: false };

const COPTER_META: Record<number, ModeMeta> = {
  0: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.manualFlightWithSelfLeveling', icon: Hand, safe: true },
  1: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.fullManualControlNoSelf', icon: Gamepad2, safe: false },
  2: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.altitudeHoldWithManualPosition', icon: Ruler, safe: true },
  3: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.followMissionWaypoints', icon: Map, safe: true },
  4: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.flyToGcsCommandedPoints', icon: Navigation, safe: true },
  5: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.holdPositionAndAltitude', icon: Lock, safe: true },
  6: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.returnToLaunchPoint', icon: Home, safe: true },
  7: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.circleAroundAPoint', icon: Circle, safe: true },
  9: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.automaticLanding', icon: PlaneLanding, safe: true },
  11: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.likeStabilizeButWithDrift', icon: Wind, safe: false },
  13: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.stabilizeWithHigherRates', icon: Dumbbell, safe: false },
  14: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.automaticFlipManeuver', icon: RotateCcw, safe: false },
  15: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.automaticPidTuning', icon: Wrench, safe: true },
  16: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.positionHoldLikeLoiter', icon: Pin, safe: true },
  17: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.stopImmediately', icon: Octagon, safe: true },
  18: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.throwToStart', icon: Rocket, safe: false },
  19: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.avoidOtherAircraft', icon: Plane, safe: true },
  20: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.guidedWithoutGps', icon: Navigation, safe: false },
  21: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.returnViaOriginalPath', icon: Home, safe: true },
  22: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.positionHoldWithOpticalFlow', icon: Move, safe: true },
  23: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.followAnotherVehicle', icon: Users, safe: true },
  24: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.zigzagSurveyPattern', icon: Zap, safe: true },
  25: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.systemIdentification', icon: Activity, safe: false },
  26: { descriptionKey: `${D}.heliAutorotationLanding`, icon: Fan, safe: false },
  27: { descriptionKey: `${D}.returnViaMissionLanding`, icon: Home, safe: true },
};

const PLANE_META: Record<number, ModeMeta> = {
  0: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.fullManualControl', icon: Hand, safe: false },
  1: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.circleAroundAPoint', icon: Circle, safe: true },
  2: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.levelFlightWithManualThrottle', icon: Hand, safe: true },
  3: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.limitsRollPitchButAllows', icon: Dumbbell, safe: true },
  4: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.rateControlledAerobatics', icon: Gamepad2, safe: false },
  5: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.flyByWireAStabilized', icon: Plane, safe: true },
  6: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.flyByWireBSpeed', icon: Plane, safe: true },
  7: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.throttleAndRollHoldHeading', icon: Navigation, safe: true },
  8: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.automaticPidTuning', icon: Wrench, safe: true },
  10: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.followMissionWaypoints', icon: Map, safe: true },
  11: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.returnToLaunchPoint', icon: Home, safe: true },
  12: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.circleAndHoldPosition', icon: Lock, safe: true },
  13: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.automaticTakeoff', icon: Rocket, safe: true },
  14: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.avoidOtherAircraft', icon: AlertTriangle, safe: true },
  15: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.flyToGcsCommandedPoints', icon: Navigation, safe: true },
  17: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.vtolStabilizeMode', icon: Hand, safe: true },
  18: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.vtolHoverInPlace', icon: Pin, safe: true },
  19: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.vtolPositionHold', icon: Lock, safe: true },
  20: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.vtolAutomaticLanding', icon: PlaneLanding, safe: true },
  21: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.vtolReturnToLaunch', icon: Home, safe: true },
  22: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.vtolAutomaticPidTuning', icon: Wrench, safe: true },
  23: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.vtolRateControlledAerobatics', icon: Gamepad2, safe: false },
  24: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.soaringThermalDetection', icon: Wind, safe: true },
  25: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.loiterThenVtolLand', icon: PlaneLanding, safe: true },
};

const ROVER_META: Record<number, ModeMeta> = {
  0: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.fullManualThrottleAndSteering', icon: Hand, safe: true },
  1: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.manualWithTurnRateControl', icon: Gamepad2, safe: false },
  3: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.manualSteeringSpeedControlled', icon: Navigation, safe: true },
  4: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.stopAndHoldPosition', icon: Lock, safe: true },
  5: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.holdPositionUsingGps', icon: Pin, safe: true },
  6: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.followAnotherVehicle', icon: Users, safe: true },
  7: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.simplifiedControlRelativeToHome', icon: Home, safe: true },
  10: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.followMissionWaypoints', icon: Map, safe: true },
  11: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.returnToLaunchPoint', icon: Home, safe: true },
  12: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.returnViaOriginalPath', icon: Home, safe: true },
  15: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.driveToGcsCommandedPoints', icon: Navigation, safe: true },
  16: { descriptionKey: 'mavlink-config:flightModesTab.modeDesc.systemInitializing', icon: Activity, safe: false },
  8: { descriptionKey: `${D}.driveToAndDock`, icon: Anchor, safe: true },
  9: { descriptionKey: `${D}.circleAroundAPoint`, icon: Circle, safe: true },
};

const NAMES: Record<VehicleCategory, Record<number, string>> = { copter: COPTER_MODES, plane: PLANE_MODES, rover: ROVER_MODES };
const META: Record<VehicleCategory, Record<number, ModeMeta>> = { copter: COPTER_META, plane: PLANE_META, rover: ROVER_META };

function build(category: VehicleCategory): Record<number, ModeInfo> {
  const out: Record<number, ModeInfo> = {};
  for (const [num, name] of Object.entries(NAMES[category])) {
    out[Number(num)] = { name, ...(META[category][Number(num)] ?? FALLBACK_META) };
  }
  return out;
}

const MODES: Record<VehicleCategory, Record<number, ModeInfo>> = { copter: build('copter'), plane: build('plane'), rover: build('rover') };

/** Every mode vehicle-core lists for the category, decorated. */
export function getModesForCategory(category: VehicleCategory): Record<number, ModeInfo> {
  return MODES[category] ?? MODES.copter;
}

export function getModeInfo(modeNum: number, category: VehicleCategory = 'copter'): ModeInfo {
  return getModesForCategory(category)[modeNum] ?? { name: 'Unknown', descriptionKey: 'common:unknownMode', icon: HelpCircle, safe: false }; // i18n-exempt: replaced by t('common:unknownMode') in the view
}
