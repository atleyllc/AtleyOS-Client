import * as Calendar from "expo-calendar";
import * as Contacts from "expo-contacts";
import * as Location from "expo-location";
import * as MediaLibrary from "expo-media-library";
import * as Device from "expo-device";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ingestObservation } from "./api";
import type { SyncStatus } from "./types";

const QUEUE_KEY = "atleyos.observation.queue.v1";
const STATUS_KEY = "atleyos.observation.status.v1";

export type ObsItem = {
  source_class: string;
  title: string;
  body?: string;
  external_id?: string;
  occurred_at?: number;
  metadata?: Record<string, unknown>;
};

async function loadQueue(): Promise<ObsItem[]> {
  try {
    const raw = await AsyncStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as ObsItem[]) : [];
  } catch {
    return [];
  }
}

async function saveQueue(items: ObsItem[]): Promise<void> {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(items));
}

export async function getSyncStatus(): Promise<SyncStatus> {
  try {
    const raw = await AsyncStorage.getItem(STATUS_KEY);
    if (raw) return JSON.parse(raw) as SyncStatus;
  } catch {
    /* ignore */
  }
  return { pending: 0, sources: {} };
}

async function setSyncStatus(status: SyncStatus): Promise<void> {
  await AsyncStorage.setItem(STATUS_KEY, JSON.stringify(status));
}

export async function requestAllLearningPermissions(): Promise<
  Record<string, boolean>
> {
  const results: Record<string, boolean> = {};
  try {
    const c = await Contacts.requestPermissionsAsync();
    results.contacts = c.status === "granted";
  } catch {
    results.contacts = false;
  }
  try {
    const cal = await Calendar.requestCalendarPermissionsAsync();
    results.calendar = cal.status === "granted";
  } catch {
    results.calendar = false;
  }
  try {
    const loc = await Location.requestForegroundPermissionsAsync();
    results.location = loc.status === "granted";
  } catch {
    results.location = false;
  }
  try {
    const media = await MediaLibrary.requestPermissionsAsync();
    results.photos = media.status === "granted";
  } catch {
    results.photos = false;
  }
  results.device_context = true;
  return results;
}

async function collectContacts(): Promise<ObsItem[]> {
  const perm = await Contacts.getPermissionsAsync();
  if (perm.status !== "granted") return [];
  const { data } = await Contacts.getContactsAsync({
    fields: [Contacts.Fields.Name, Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
    pageSize: 200,
  });
  return (data || []).slice(0, 200).map((c) => ({
    source_class: "contacts",
    title: c.name || "Contact",
    body: [
      ...(c.emails || []).map((e) => e.email),
      ...(c.phoneNumbers || []).map((p) => p.number),
    ]
      .filter(Boolean)
      .join(" · "),
    external_id: c.id,
    metadata: { contactType: c.contactType },
  }));
}

async function collectCalendar(): Promise<ObsItem[]> {
  const perm = await Calendar.getCalendarPermissionsAsync();
  if (perm.status !== "granted") return [];
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const now = Date.now();
  const start = new Date(now - 7 * 864e5);
  const end = new Date(now + 30 * 864e5);
  const items: ObsItem[] = [];
  for (const cal of calendars.slice(0, 8)) {
    try {
      const events = await Calendar.getEventsAsync([cal.id], start, end);
      for (const ev of events.slice(0, 100)) {
        items.push({
          source_class: "calendar",
          title: ev.title || "Event",
          body: [ev.location, ev.notes].filter(Boolean).join(" — "),
          external_id: ev.id,
          occurred_at: ev.startDate
            ? new Date(ev.startDate).getTime() / 1000
            : undefined,
          metadata: { calendar: cal.title },
        });
      }
    } catch {
      /* skip calendar */
    }
  }
  return items;
}

async function collectLocation(): Promise<ObsItem[]> {
  const perm = await Location.getForegroundPermissionsAsync();
  if (perm.status !== "granted") return [];
  try {
    const pos = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    return [
      {
        source_class: "location",
        title: "Current place",
        body: `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`,
        occurred_at: (pos.timestamp || Date.now()) / 1000,
        metadata: {
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude,
        },
      },
    ];
  } catch {
    return [];
  }
}

async function collectPhotosMetadata(): Promise<ObsItem[]> {
  const perm = await MediaLibrary.getPermissionsAsync();
  if (perm.status !== "granted") return [];
  try {
    const page = await MediaLibrary.getAssetsAsync({
      first: 50,
      mediaType: ["photo", "video"],
      sortBy: [["creationTime", false]],
    });
    return (page.assets || []).map((a) => ({
      source_class: "photos_metadata",
      title: a.filename || "Media",
      body: a.mediaType,
      external_id: a.id,
      occurred_at: (a.creationTime || Date.now()) / 1000,
      metadata: {
        width: a.width,
        height: a.height,
        duration: a.duration,
      },
    }));
  } catch {
    return [];
  }
}

function deviceContext(): ObsItem[] {
  return [
    {
      source_class: "device_context",
      title: "Device",
      body: `${Device.modelName || Device.deviceName || "phone"} · ${Platform.OS} ${Device.osVersion || ""}`,
      metadata: {
        brand: Device.brand,
        isDevice: Device.isDevice,
      },
    },
  ];
}

export async function collectAndEnqueue(): Promise<number> {
  const batches = await Promise.all([
    collectContacts(),
    collectCalendar(),
    collectLocation(),
    collectPhotosMetadata(),
  ]);
  const items = [...deviceContext(), ...batches.flat()];
  const queue = await loadQueue();
  const merged = [...queue, ...items];
  await saveQueue(merged);
  const status = await getSyncStatus();
  status.pending = merged.length;
  status.sources = {
    contacts: { granted: batches[0].length > 0, lastCount: batches[0].length },
    calendar: { granted: batches[1].length > 0, lastCount: batches[1].length },
    location: { granted: batches[2].length > 0, lastCount: batches[2].length },
    photos_metadata: {
      granted: batches[3].length > 0,
      lastCount: batches[3].length,
    },
    device_context: { granted: true, lastCount: 1 },
  };
  await setSyncStatus(status);
  return items.length;
}

export async function flushQueue(): Promise<{ accepted: number; error?: string }> {
  const queue = await loadQueue();
  if (!queue.length) return { accepted: 0 };
  try {
    const chunk = queue.slice(0, 100);
    const out = await ingestObservation(chunk);
    const rest = queue.slice(chunk.length);
    await saveQueue(rest);
    const status = await getSyncStatus();
    status.pending = rest.length;
    status.lastSyncAt = Date.now();
    status.lastError = undefined;
    await setSyncStatus(status);
    return { accepted: out.accepted ?? chunk.length };
  } catch (e) {
    const status = await getSyncStatus();
    status.lastError = e instanceof Error ? e.message : String(e);
    await setSyncStatus(status);
    return { accepted: 0, error: status.lastError };
  }
}

export async function runObservationCycle(): Promise<SyncStatus> {
  await collectAndEnqueue();
  await flushQueue();
  return getSyncStatus();
}
