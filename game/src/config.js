// Tuning constants for Velocity City: the simulation step, the shape of the street grid, how fast
// people and cars move, how the camera behaves, and the sun-soaked art direction. Every other
// module reads its numbers from here, so the feel of the game is tuned in one place.

/** The fixed simulation step, in seconds. */
export const STEP = 1 / 60;
/** The most simulation steps one animation frame may catch up on. */
export const MAX_STEPS_PER_FRAME = 5;

/** The street grid of Velocity City, Meridian. Distances are world units (1 unit = 1 CSS px at zoom 1). */
export const CITY = {
  cols: 11,
  rows: 10,
  laneWidth: 26,
  sidewalk: 18,
  parkingLane: 20,
  median: 6,
  blockWidth: [300, 380],
  blockHeight: [236, 292],
  avenueCols: [0, 4, 8],
  avenueRows: [3, 7],
  promenadeWidth: 70,
  sandWidth: 170,
  seaDepth: 1300,
  margin: 320,
  floorHeight: 3,
  downtown: { i: 5, j: 4 },
  park: { i: 2, j: 6 },
  stadium: { i: 8, j: 6 },
  hospital: { i: 6, j: 1 },
  marinaRows: [6, 9],
  cell: 128,
};

/** Traffic signals: one cycle, north-south green first. */
export const SIGNAL = { cycle: 17, nsGreen: 7, nsAmber: 8.5, ewGreen: 15.5 };

export const PLAYER = {
  radius: 7,
  walkSpeed: 92,
  runSpeed: 182,
  staminaMax: 100,
  staminaDrain: 24,
  staminaRegen: 16,
  healthMax: 100,
  armourMax: 100,
  startArmour: 40,
  startMoney: 1250,
  fireInterval: 0.2,
  magazine: 12,
  reloadTime: 1.25,
  spread: 0.035,
  hospitalFee: 500,
};

export const BULLET = { speed: 1500, range: 720, carDamage: 9, pedRadius: 6, playerDamage: 7, playerRadius: 7, driverDamage: 1.5 };

export const PED = {
  count: 110,
  radius: 5.5,
  walkSpeed: [30, 48],
  runSpeed: 128,
  fleeRadius: 430,
  fleeTime: [4, 7],
  crossChance: 0.35,
  downTime: [5, 8],
};

export const TRAFFIC = {
  count: 36,
  cruise: [112, 152],
  accel: 140,
  brake: 420,
  health: 100,
  smokeAt: 45,
  burnTime: 3.6,
  speedingSpeed: 175,
};

export const POLICE = {
  speed: 275, chaseSpeed: 318, seekRange: 340, loseRange: 980, holdDistance: 86, perStar: 1, max: 5, patrols: 2,
  fireRange: 300, fireInterval: 0.8, spread: 0.11, fireFromLevel: 2, roadblockFromLevel: 3, roadblockEvery: 14,
  witnessRange: 520,
};

/** The player's car: engine, brakes, grip, steering, damage. Speeds are world units per second. */
export const DRIVE = {
  enterRange: 22,
  maxEnterSpeed: 95,
  topSpeed: 345,
  reverseSpeed: 110,
  accel: 300,
  brake: 520,
  reverseAccel: 170,
  drag: 0.32,
  roll: 46,
  grip: 11,
  handbrakeGrip: 1.4,
  handbrakeDrag: 160,
  steerRate: 3.1,
  steerResponse: 7,
  highSpeedSteer: 0.55,
  handbrakeSpin: 1.9,
  slipMarks: 34,
  crashMin: 70,
  crashDamage: 0.14,
  pedHitSpeed: 40,
  speeding: 245,
  driveByArc: [0.42, 2.7],
  /** Per body style: engine and top speed multiplier. */
  power: { compact: 0.98, sedan: 1, wagon: 0.94, cab: 1, van: 0.8, pickup: 0.9, roadster: 1.14, police: 1.08 },
  /** Units per second to miles per hour on the speedometer. */
  mph: 0.25,
};

export const WANTED = { thresholds: [0, 10, 40, 90, 160, 260], calmDelay: 18, decay: 7 };

export const EXPLOSION = { radius: 120, carDamage: 60, playerDamage: 70 };

/** Recycling ring around the focus: never spawn closer than spawnMin (always off screen). */
export const POPULATION = { spawnMin: 960, spawnMax: 1240, despawn: 1420, nearFraction: 0.5 };

export const CAMERA = {
  /** Screen pixels per world unit for a 720 px tall window; taller windows scale up. */
  baseZoom: 1.05,
  lookAhead: 0.3,
  maxLook: 170,
  follow: 5,
  zoomFollow: 2,
  speedZoomOut: 0.09,
  /** In a car: how far the camera pulls back at top speed and how far ahead it leads (seconds of travel). */
  driveZoomOut: 0.3,
  driveLead: 0.42,
  maxDriveLead: 150,
  driveLook: 0.12,
  driveFollow: 6.5,
  maxShake: 14,
  shakeDecay: 1.7,
};

export const RENDER = {
  /** How far a roof slides sideways per unit of height at the screen edge (fake perspective). */
  lean: 0.22,
  cullMargin: 80,
  extrusionMargin: 170,
};

/** Game clock: hour of day at the start and how fast it runs. */
export const TIME = { start: 10.5, hoursPerSecond: 1 / 120 };

/** Sun-soaked art direction: warm bone concrete, teal sea, coral and mint, deep blue shadows. */
export const PALETTE = {
  concrete: '#e7dac2',
  sidewalk: '#efe3cc',
  curb: '#cdbfa5',
  asphalt: '#454a5a',
  asphaltWorn: '#4d5263',
  laneWhite: '#f3ead6',
  laneYellow: '#f4c95d',
  sand: '#f2d8a2',
  sandWet: '#d9bb86',
  seaShallow: '#46c7b8',
  seaDeep: '#11708a',
  foam: '#eefcf5',
  grass: '#9fcd7c',
  grassDark: '#86b968',
  scrub: '#cdbf8e',
  coral: '#ff7a68',
  mint: '#79e0c0',
  lemon: '#f6d76b',
  sky: '#8ec9e8',
  shadow: '#24306e',
  ink: '#1c2340',
  plaza: '#dccdb2',
  parking: '#5a5f6c',
  wood: '#b98a5c',
  water: '#3fb3b0',
  wallsDowntown: ['#4f8aa3', '#3e6d97', '#8fb3c4', '#b78f69', '#a8b6c2', '#5c9a96'],
  wallsMidtown: ['#f0dcc0', '#eab9a2', '#a9dbc8', '#efd994', '#c8badb', '#f3eee2', '#e8a48f'],
  wallsResidential: ['#f4e3c8', '#f1c3ad', '#bfe3d1', '#f4e2a1', '#d9cbe6', '#fbf5ea'],
  wallsBeach: ['#fbf5ea', '#bfeadb', '#f7d2c0', '#f6e7b6', '#cfe6f0'],
  wallsIndustrial: ['#c7bea9', '#b8b2a5', '#d5c6a3', '#a7a99f'],
  roofLight: '#e9e2d4',
  roofTerracotta: '#d98060',
  cars: ['#ff7a68', '#79e0c0', '#f6f0e2', '#8ec9e8', '#f6d76b', '#3b4256', '#c9b2e6', '#ef9a4f', '#d8dde3', '#5aa6a0'],
  shirts: ['#ff7a68', '#79e0c0', '#ffffff', '#f6d76b', '#8ec9e8', '#c9b2e6', '#2d3a64', '#ef9a4f', '#f29bb8', '#e9e2d4'],
  pants: ['#3c5a86', '#c9b48c', '#f1ece0', '#2b2f3c', '#6f8f74', '#8d6a4f'],
  skins: ['#f3cfb3', '#e2b08c', '#c68a62', '#9b6544', '#6f4630', '#f0c4a0'],
  hair: ['#2a1d16', '#5a3a22', '#c8a060', '#1b1b1f', '#8a4b2a', '#e3d3b0'],
};

/** Invented vehicle models: length and width in world units. */
export const CAR_MODELS = [
  { name: 'Halcyon Bolt', kind: 'compact', length: 40, width: 19 },
  { name: 'Marlin Sedan', kind: 'sedan', length: 46, width: 20 },
  { name: 'Tern Wagon', kind: 'wagon', length: 48, width: 21 },
  { name: 'Solano Cab', kind: 'cab', length: 46, width: 20 },
  { name: 'Vesper Van', kind: 'van', length: 52, width: 22 },
  { name: 'Coastline Ute', kind: 'pickup', length: 49, width: 21 },
  { name: 'Ardent Roadster', kind: 'roadster', length: 42, width: 19 },
];

export const POLICE_MODEL = { name: 'Meridian Patrol Interceptor', kind: 'police', length: 48, width: 21 };
