// Starting tuning values from the design doc. Change after playtesting.

export const SEAT_SWITCH_TIME = 2.0; // s, same for every seat

// Driving
export const TOP_SPEED_FORWARD = 12; // m/s
export const TOP_SPEED_REVERSE = 4; // m/s
export const HULL_TURN_RATE = (30 * Math.PI) / 180; // rad/s at full steering
export const THROTTLE_STEPS = [-1, -0.5, 0, 0.25, 0.5, 1] as const;
export const STEER_STEP = 0.25;

// Turret and gun
export const TURRET_TURN_RATE = (24 * Math.PI) / 180; // rad/s
export const GUN_ELEVATION_RATE = (12 * Math.PI) / 180; // rad/s
export const GUN_MIN_ELEVATION = (-8 * Math.PI) / 180;
export const GUN_MAX_ELEVATION = (20 * Math.PI) / 180;

// Tank body
export const TANK_MASS = 30000; // kg
export const HULL_HALF = { x: 1.7, y: 0.6, z: 3.25 }; // m, forward is -z

// Lookout
export const HATCH_KILL_RADIUS = 3; // m
export const SPOT_TIME_EYES = 0.5; // s
export const SPOT_TIME_BINOCULARS = 1.5; // s
export const SPOT_MARKER_LIFETIME = 20; // s

// World
export const MAP_SIZE = 1000; // m, square, centred on the origin
export const MAP_CELLS = 128; // height grid cells per side
export const FOG_FAR = 300; // m
export const DESTRUCT_SPEED = 3; // m/s, tank speed that breaks fences and trees

// Rendering
export const RENDER_WIDTH = 480;
export const RENDER_HEIGHT = 270;

export const PHYSICS_HZ = 60;
