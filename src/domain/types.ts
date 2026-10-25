export type MetricKind = 'soil' | 'temp' | 'lux' | 'tank';

/** One reading from an ESP32 node (see hardware/plantnet_node). */
export type Reading = {
  /** epoch ms */
  t: number;
  /** soil moisture, % (calibrated on the node) */
  soil: number;
  /** °C */
  temp: number;
  /** illuminance, lux; null while the BH1750 isn't answering */
  lux: number | null;
  /** reservoir level, % */
  tank: number;
  /** true when you logged a watering at this point */
  watered?: boolean;
};

export type Range = { min: number; max: number };

export type Species = {
  id: string;
  name: string;
  latin: string;
  emoji: string;
  /** short care blurb shown during onboarding */
  blurb: string;
  difficulty: 'easy' | 'medium' | 'fussy';
  light: 'low' | 'medium' | 'bright';
  soil: Range;
  temp: Range;
  hum: Range;
  lux: Range;
  /** ml of water per watering, per litre of pot volume */
  waterMlPerL: number;
  /** baseline % VWC lost per day at 22 °C */
  dryRate: number;
  fertilizeEveryDays: number;
  toxicToPets: boolean;
};

export type PlantEventType =
  | 'watered'
  | 'fertilized'
  | 'sensor_offline'
  | 'sensor_online'
  | 'photo'
  | 'added'
  | 'threshold_change';

export type PlantEvent = {
  id: string;
  t: number;
  type: PlantEventType;
  note: string;
  /** ml dispensed, when relevant */
  ml?: number;
  by?: string;
};

export type GrowthPhoto = {
  id: string;
  t: number;
  uri: string;
};

export type Plant = {
  id: string;
  name: string;
  speciesId: string;
  zone: string;
  /** grid coordinates used by the garden heat map */
  gx: number;
  gy: number;
  potLitres: number;
  addedAt: number;
  /** ESP32 address as typed, e.g. 172.20.10.2 or 172.20.10.2:80 */
  address: string;
  online: boolean;
  /** last successful reading, epoch ms; 0 = never */
  lastSeen: number;
  soilTarget: Range;
  lastWateredAt: number;
  lastFertilizedAt: number;
  /** one point per SAMPLE_MS; the last point is the live reading */
  history: Reading[];
  events: PlantEvent[];
  photos: GrowthPhoto[];
};

export type Member = {
  id: string;
  name: string;
  role: 'owner' | 'caretaker' | 'viewer';
  initials: string;
  color: string;
  lastActive: number;
};

export type Settings = {
  householdName: string;
};

export type AlertLevel = 'critical' | 'warning' | 'info';

export type Alert = {
  id: string;
  level: AlertLevel;
  title: string;
  detail: string;
  plantId?: string;
  icon: string;
  t: number;
};
