// Starting tuning values from the design doc. Change after playtesting.

export const SEAT_SWITCH_TIME = 0.6; // s, same for every seat

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
export const MAP_SIZE = 400; // m, square, centred on the origin (tight 1v1)
export const MAP_CELLS = 128; // height grid cells per side
export const FOG_NEAR = 80; // m: fog starts
export const FOG_FAR = 450; // m: nothing visible beyond
export const DESTRUCT_SPEED = 3; // m/s, tank speed that breaks fences and trees

// Rendering
// HUD layout resolution: every HUD coordinate is in these pixels.
export const RENDER_WIDTH = 480;
export const RENDER_HEIGHT = 270;
// 3D view resolution: the world renders this small, then scales up chunky. Same 16:9 as the HUD.
export const VIEW_WIDTH = 640;
export const VIEW_HEIGHT = 360;

export const PHYSICS_HZ = 60;

// Gun and shells
export const SHELL_SPEED = 600; // m/s muzzle velocity
export const GRAVITY = 9.81;
export const SHELL_LIFETIME = 4; // s before a shell that hit nothing is removed
export const RACK_SIZE = 6;
export const STORAGE_SIZE = 30;
export const RACK_REFILL_TIME = 4; // s per shell from storage to rack
export const BARREL_LENGTH = 4.6; // m

// Damage
export const TANK_HEALTH = 100;
export const RESPAWN_DELAY = 5; // s
export const SPAWN_PROTECTION = 3; // s
export const RESULTS_TIME = 15; // s the results screen shows before the lobby
