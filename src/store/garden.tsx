import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { round, uid } from '@/lib/util';
import { speciesById } from '@/domain/species';
import { OFFLINE_MS } from '@/domain/insights';
import type { GrowthPhoto, Member, Plant, PlantEvent, Reading, Settings } from '@/domain/types';

const STORAGE_KEY = 'plantnet.state.v2';
const POLL_MS = 2000;
/** History keeps one point per 5 minutes (14 days ≈ 4k points per plant); the newest point tracks the live value. */
const SAMPLE_MS = 5 * 60_000;
const MAX_HISTORY = 14 * 24 * 12;
const SAVE_EVERY_MS = 60_000;

export type GardenState = {
  ready: boolean;
  now: number;
  plants: Plant[];
  members: Member[];
  settings: Settings;
};

export type NewPlantInput = {
  name: string;
  speciesId: string;
  zone: string;
  potLitres: number;
  address: string;
  /** the reading from the onboarding connection test */
  first: Reading;
};

type Actions = {
  logWatering: (plantId: string, ml?: number) => void;
  fertilize: (plantId: string) => void;
  setSoilTarget: (plantId: string, min: number, max: number) => void;
  renamePlant: (plantId: string, name: string) => void;
  setAddress: (plantId: string, address: string) => void;
  addPlant: (input: NewPlantInput) => string;
  removePlant: (plantId: string) => void;
  addPhoto: (plantId: string, uri: string) => void;
  setSettings: (patch: Partial<Settings>) => void;
  addMember: (name: string, role: Member['role']) => void;
  removeMember: (id: string) => void;
  resetAll: () => void;
};

const GardenContext = createContext<(GardenState & Actions) | null>(null);

export function useGarden() {
  const ctx = useContext(GardenContext);
  if (!ctx) throw new Error('useGarden must be used inside <GardenProvider>');
  return ctx;
}

export function usePlant(id: string | undefined) {
  const { plants } = useGarden();
  return plants.find((p) => p.id === id);
}

/* ------------------------------------------------------------------ *
 * Talking to the ESP32 (GET / → {"soil":..,"temp":..,"lux":..,"tank":..})
 * ------------------------------------------------------------------ */

export function nodeUrl(address: string): string {
  const a = address.trim();
  return /^https?:\/\//.test(a) ? a : `http://${a}`;
}

export async function fetchReading(address: string, timeoutMs = POLL_MS - 200): Promise<Reading> {
  const url = nodeUrl(address);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let j: any;
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    j = await r.json();
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error(`No answer from ${url} within ${(timeoutMs / 1000).toFixed(1)} s`);
    if (e instanceof SyntaxError) throw new Error(`${url} answered, but not with PlantNet sensor data`);
    throw new Error(`Can't reach ${url}`);
  } finally {
    clearTimeout(timer);
  }
  if (![j?.soil, j?.temp, j?.lux, j?.tank].every((v) => typeof v === 'number' && isFinite(v))) {
    throw new Error(`${url} answered, but not with PlantNet sensor data`);
  }
  return {
    t: Date.now(),
    soil: round(j.soil, 1),
    temp: round(j.temp, 1),
    lux: j.lux >= 0 ? Math.round(j.lux) : null, // the firmware sends -1 when the BH1750 is silent
    tank: round(j.tank, 1),
  };
}

function ingest(p: Plant, r: Reading): Plant {
  const h = p.history;
  // Overwrite the newest point until it is SAMPLE_MS past the one before it, then start a new one.
  const replace = h.length >= 2 && r.t - h[h.length - 2].t < SAMPLE_MS;
  const point = replace && h[h.length - 1].watered ? { ...r, watered: true } : r;
  const history = replace ? [...h.slice(0, -1), point] : [...h, point];
  if (history.length > MAX_HISTORY) history.splice(0, history.length - MAX_HISTORY);
  return { ...p, history, lastSeen: r.t, online: true };
}

/** r: the reading, null = the poll failed, undefined = this address wasn't polled. */
function applyPoll(p: Plant, r: Reading | null | undefined, now: number): Plant {
  if (r === undefined) return p;
  if (r) {
    const next = ingest(p, r);
    return p.online ? next : withEvent(next, 'sensor_online', `Back online at ${p.address}`, r.t);
  }
  if (p.online && now - p.lastSeen >= OFFLINE_MS) {
    return withEvent({ ...p, online: false }, 'sensor_offline', `Lost contact with ${p.address}`, now);
  }
  return p;
}

function withEvent(p: Plant, type: PlantEvent['type'], note: string, t: number, extra?: Partial<PlantEvent>): Plant {
  return { ...p, events: [{ id: uid('ev'), t, type, note, ...extra }, ...p.events].slice(0, 200) };
}

/* ------------------------------------------------------------------ */

const DEFAULT_SETTINGS: Settings = { householdName: 'Home Garden' };

function emptyGarden(): GardenState {
  const now = Date.now();
  return {
    ready: true,
    now,
    plants: [],
    members: [{ id: 'm_you', name: 'You', role: 'owner', initials: 'YO', color: '#3DDC84', lastActive: now }],
    settings: DEFAULT_SETTINGS,
  };
}

type Persisted = Omit<GardenState, 'ready' | 'now'>;

export function GardenProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<GardenState>(() => ({ ...emptyGarden(), ready: false }));
  const stateRef = useRef(state);
  stateRef.current = state;
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- hydrate ---- */
  useEffect(() => {
    let alive = true;
    (async () => {
      let next = emptyGarden();
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const p = JSON.parse(raw) as Persisted;
          next = { ...next, plants: p.plants, members: p.members, settings: { ...DEFAULT_SETTINGS, ...p.settings } };
        }
      } catch {
        // Corrupt or unreadable cache: start with an empty garden.
      }
      if (alive) setState(next);
    })();
    return () => {
      alive = false;
    };
  }, []);

  /* ---- persist ---- */
  const save = useCallback(() => {
    const { plants, members, settings, ready } = stateRef.current;
    if (!ready) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ plants, members, settings } satisfies Persisted)).catch(() => {});
  }, []);

  const scheduleSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 800);
  }, [save]);

  // Readings arrive every 2 s; writing ~4k points per plant that often is wasteful, so save once a minute
  // and whenever the app goes to the background.
  useEffect(() => {
    const id = setInterval(save, SAVE_EVERY_MS);
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') save();
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [save]);

  const update = useCallback(
    (fn: (s: GardenState) => GardenState) => {
      setState((s) => fn(s));
      scheduleSave();
    },
    [scheduleSave],
  );

  /* ---- poll every ESP32 ---- */
  useEffect(() => {
    if (!state.ready) return;
    let alive = true;
    let busy = false;
    const poll = async () => {
      if (busy) return;
      busy = true;
      const addresses = [...new Set(stateRef.current.plants.map((p) => p.address))];
      const results = new Map(
        await Promise.all(addresses.map(async (a) => [a, await fetchReading(a).catch(() => null)] as const)),
      );
      busy = false;
      if (!alive) return;
      const now = Date.now();
      setState((s) => ({ ...s, now, plants: s.plants.map((p) => applyPoll(p, results.get(p.address), now)) }));
    };
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [state.ready]);

  /* ---- actions ---- */
  const actions = useMemo<Actions>(
    () => ({
      logWatering: (plantId, ml) =>
        update((s) =>
          patchPlant(s, plantId, (p) => {
            const dose = ml ?? Math.round(speciesById(p.speciesId).waterMlPerL * p.potLitres);
            const history = p.history.length
              ? [...p.history.slice(0, -1), { ...p.history[p.history.length - 1], watered: true }]
              : p.history;
            return withEvent({ ...p, history, lastWateredAt: s.now }, 'watered', `Watered ${dose} ml`, s.now, {
              ml: dose,
              by: 'You',
            });
          }),
        ),

      fertilize: (plantId) =>
        update((s) =>
          patchPlant(s, plantId, (p) =>
            withEvent({ ...p, lastFertilizedAt: s.now }, 'fertilized', 'Fertiliser logged', s.now, { by: 'You' }),
          ),
        ),

      setSoilTarget: (plantId, min, max) =>
        update((s) =>
          patchPlant(s, plantId, (p) =>
            withEvent(
              { ...p, soilTarget: { min: Math.round(min), max: Math.round(max) } },
              'threshold_change',
              `Target band set to ${Math.round(min)}–${Math.round(max)}%`,
              s.now,
              { by: 'You' },
            ),
          ),
        ),

      renamePlant: (plantId, name) => update((s) => patchPlant(s, plantId, (p) => ({ ...p, name }))),

      setAddress: (plantId, address) => update((s) => patchPlant(s, plantId, (p) => ({ ...p, address: address.trim() }))),

      addPlant: (input) => {
        const id = uid('p');
        update((s) => {
          const species = speciesById(input.speciesId);
          const used = new Set(s.plants.map((p) => `${p.gx},${p.gy}`));
          let gx = 0;
          let gy = 0;
          outer: for (let y = 0; y < 6; y++) {
            for (let x = 0; x < 4; x++) {
              if (!used.has(`${x},${y}`)) {
                gx = x;
                gy = y;
                break outer;
              }
            }
          }
          const plant: Plant = {
            id,
            name: input.name.trim() || species.name,
            speciesId: input.speciesId,
            zone: input.zone,
            gx,
            gy,
            potLitres: input.potLitres,
            addedAt: s.now,
            address: input.address.trim(),
            online: true,
            lastSeen: input.first.t,
            soilTarget: { ...species.soil },
            lastWateredAt: 0,
            lastFertilizedAt: s.now,
            history: [input.first],
            events: [],
            photos: [],
          };
          return {
            ...s,
            plants: [...s.plants, withEvent(plant, 'added', `Added and connected to ${plant.address}`, s.now, { by: 'You' })],
          };
        });
        return id;
      },

      removePlant: (plantId) => update((s) => ({ ...s, plants: s.plants.filter((p) => p.id !== plantId) })),

      addPhoto: (plantId, uri) =>
        update((s) =>
          patchPlant(s, plantId, (p) => {
            const photo: GrowthPhoto = { id: uid('ph'), t: s.now, uri };
            return withEvent({ ...p, photos: [photo, ...p.photos] }, 'photo', 'Growth photo added', s.now, { by: 'You' });
          }),
        ),

      setSettings: (patch) => update((s) => ({ ...s, settings: { ...s.settings, ...patch } })),

      addMember: (name, role) =>
        update((s) => ({
          ...s,
          members: [
            ...s.members,
            {
              id: uid('m'),
              name,
              role,
              initials: name.slice(0, 2).toUpperCase(),
              color: ['#4CC2FF', '#A78BFA', '#F472B6', '#FFC24B'][s.members.length % 4],
              lastActive: s.now,
            },
          ],
        })),

      removeMember: (id) => update((s) => ({ ...s, members: s.members.filter((m) => m.id !== id) })),

      resetAll: () => {
        AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
        setState(emptyGarden());
      },
    }),
    [update],
  );

  const value = useMemo(() => ({ ...state, ...actions }), [state, actions]);
  return <GardenContext.Provider value={value}>{children}</GardenContext.Provider>;
}

function patchPlant(s: GardenState, id: string, fn: (p: Plant) => Plant): GardenState {
  return { ...s, plants: s.plants.map((p) => (p.id === id ? fn(p) : p)) };
}
