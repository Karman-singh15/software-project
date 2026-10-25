import { useEffect, useMemo, useRef } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

import { buildAlerts } from '@/domain/insights';
import { useGarden } from '@/store/garden';

/** Dry soil and a low tank keep popping at this interval for as long as they last (and the node is online). */
const REPEAT_MS = 10_000;
/** Other alerts that clear and come back within this window stay quiet. */
const COOLDOWN_MS = 30 * 60_000;
const native = Platform.OS !== 'web';

const repeats = (id: string) => id.startsWith('dry_') || id.startsWith('tank_');
/** Temperature and light pop on every crossing of their range, with no cooldown. */
const everyCrossing = (id: string) => id.startsWith('temp_') || id.startsWith('light_');

if (native) {
  // Show the banner even while the app is open.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Pops a system notification when an alert starts, gets more severe, or (soil/tank) every 10 s while it lasts. */
export function AlertNotifier() {
  const g = useGarden();
  const router = useRouter();
  const alerts = useMemo(() => buildAlerts(g.plants, g.now), [g.plants, g.now]);
  const latest = useRef({ alerts, plants: g.plants, ready: g.ready });
  latest.current = { alerts, plants: g.plants, ready: g.ready };
  const active = useRef(new Set<string>());
  const lastSent = useRef(new Map<string, number>());

  useEffect(() => {
    if (!native) return;
    Notifications.requestPermissionsAsync().catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const plantId = res.notification.request.content.data?.plantId;
      if (typeof plantId === 'string') router.push(`/plant/${plantId}`);
    });
    return () => sub.remove();
  }, [router]);

  // A 1 s tick rather than reacting to each 2 s poll, so the 10 s repeat lands on time.
  useEffect(() => {
    if (!native) return;
    const id = setInterval(() => {
      const { alerts, plants, ready } = latest.current;
      if (!ready) return;
      const now = Date.now();
      const keys = new Set<string>();
      for (const a of alerts) {
        const key = `${a.id}:${a.level}`; // level in the key, so warning → critical pops at once
        keys.add(key);
        const last = lastSent.current.get(key) ?? 0;
        const isNew = !active.current.has(key);
        const online = plants.find((p) => p.id === a.plantId)?.online ?? true;
        const send = repeats(a.id)
          ? online && now - last >= REPEAT_MS
          : isNew && (everyCrossing(a.id) || now - last >= COOLDOWN_MS);
        if (!send) continue;
        lastSent.current.set(key, now);
        Notifications.scheduleNotificationAsync({
          // Same identifier per alert, so repeats replace each other in Notification Centre instead of piling up.
          identifier: a.id,
          content: { title: a.title, body: a.detail, data: { plantId: a.plantId } },
          trigger: null,
        }).catch(() => {});
      }
      active.current = keys;
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return null;
}
