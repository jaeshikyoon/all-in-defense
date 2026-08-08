import { BUILDINGS, type MapAssetKind } from "./data";
import type { MapData } from "./Engine";

export type StoredMap = MapData & {
  id: string;
  name: string;
  schemaVersion: 1;
  revision: number;
  createdAt: number;
  updatedAt: number;
};

export type ScoreRecord = {
  id: string;
  mapId: string;
  mapRevision: number;
  kills: number;
  phase: number;
  elapsedSeconds: number;
  playedAt: number;
};

const DB_NAME = "all-in-defense-local";
const DB_VERSION = 1;
const CURRENT_MAP_KEY = "current-map-id";

const requestValue = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const transactionDone = (transaction: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });

let databasePromise: Promise<IDBDatabase> | null = null;

const openDatabase = () => {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("maps"))
        database.createObjectStore("maps", { keyPath: "id" });
      if (!database.objectStoreNames.contains("scores")) {
        const scores = database.createObjectStore("scores", { keyPath: "id" });
        scores.createIndex("mapId", "mapId", { unique: false });
      }
      if (!database.objectStoreNames.contains("settings"))
        database.createObjectStore("settings", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return databasePromise;
};

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export function validateMapData(value: unknown): MapData {
  if (!value || typeof value !== "object") throw new Error("맵 JSON 형식이 아닙니다.");
  const input = value as Partial<MapData>;
  const width = Number(input.width);
  const height = Number(input.height);
  if (!Number.isFinite(width) || !Number.isFinite(height))
    throw new Error("맵 크기 정보가 없습니다.");
  const objects = Array.isArray(input.objects)
    ? input.objects
        .filter(
          (object): object is { kind: MapAssetKind; x: number; y: number } =>
            !!object &&
            typeof object === "object" &&
            BUILDINGS[(object as { kind: MapAssetKind }).kind] !== undefined &&
            Number.isFinite(Number((object as { x: number }).x)) &&
            Number.isFinite(Number((object as { y: number }).y)),
        )
        .map((object) => ({
          kind: object.kind,
          x: Number(object.x),
          y: Number(object.y),
        }))
    : [];
  const routes = Array.isArray(input.routes)
    ? input.routes
        .map((route) =>
          Array.isArray(route)
            ? route
                .filter(
                  (point): point is [number, number] =>
                    Array.isArray(point) &&
                    point.length >= 2 &&
                    Number.isFinite(Number(point[0])) &&
                    Number.isFinite(Number(point[1])),
                )
                .map(([x, y]) => [Number(x), Number(y)] as [number, number])
            : [],
        )
        .filter((route) => route.length >= 2)
    : [];
  if (!routes.length) throw new Error("입구에서 출구로 이어지는 경로가 필요합니다.");
  return {
    width,
    height,
    seed: Number.isFinite(Number(input.seed)) ? Number(input.seed) : 0xa11def,
    objects,
    routes,
    routeStartPhases: routes.map((_, index) =>
      Math.max(1, Math.round(Number(input.routeStartPhases?.[index]) || 1)),
    ),
  };
}

export async function listMaps() {
  const database = await openDatabase();
  return requestValue<StoredMap[]>(
    database.transaction("maps", "readonly").objectStore("maps").getAll(),
  ).then((maps) => maps.sort((a, b) => b.updatedAt - a.updatedAt));
}

export async function saveStoredMap(map: StoredMap) {
  const database = await openDatabase();
  const transaction = database.transaction("maps", "readwrite");
  transaction.objectStore("maps").put(map);
  await transactionDone(transaction);
  return map;
}

export async function deleteStoredMap(id: string) {
  const database = await openDatabase();
  const scores = await requestValue<ScoreRecord[]>(
    database
      .transaction("scores", "readonly")
      .objectStore("scores")
      .index("mapId")
      .getAll(id),
  );
  const transaction = database.transaction(["maps", "scores"], "readwrite");
  transaction.objectStore("maps").delete(id);
  const scoreStore = transaction.objectStore("scores");
  scores.forEach((score) => scoreStore.delete(score.id));
  await transactionDone(transaction);
}

export async function setCurrentMapId(id: string) {
  const database = await openDatabase();
  const transaction = database.transaction("settings", "readwrite");
  transaction.objectStore("settings").put({ key: CURRENT_MAP_KEY, value: id });
  await transactionDone(transaction);
}

export async function getCurrentMapId() {
  const database = await openDatabase();
  const value = await requestValue<{ key: string; value: string } | undefined>(
    database.transaction("settings", "readonly").objectStore("settings").get(CURRENT_MAP_KEY),
  );
  return value?.value ?? null;
}

let initializationPromise: Promise<{ maps: StoredMap[]; current: StoredMap }> | null = null;

async function initializeMapsInternal(fallback: MapData) {
  let maps = await listMaps();
  if (!maps.length) {
    const now = Date.now();
    maps = [
      await saveStoredMap({
        ...validateMapData(fallback),
        id: uuid(),
        name: "내 전장",
        schemaVersion: 1,
        revision: 1,
        createdAt: now,
        updatedAt: now,
      }),
    ];
  }
  const selectedId = await getCurrentMapId();
  const current = maps.find((map) => map.id === selectedId) ?? maps[0];
  await setCurrentMapId(current.id);
  return { maps, current };
}

export function initializeMaps(fallback: MapData) {
  initializationPromise ??= initializeMapsInternal(fallback);
  return initializationPromise;
}

export function createStoredMap(name: string, data: MapData): StoredMap {
  const now = Date.now();
  return {
    ...validateMapData(data),
    id: uuid(),
    name: name.trim() || "새 전장",
    schemaVersion: 1,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
}

export async function addScore(score: Omit<ScoreRecord, "id" | "playedAt">) {
  const record: ScoreRecord = { ...score, id: uuid(), playedAt: Date.now() };
  const database = await openDatabase();
  const transaction = database.transaction("scores", "readwrite");
  transaction.objectStore("scores").put(record);
  await transactionDone(transaction);
  return record;
}

export async function getMapScores(mapId: string, mapRevision?: number) {
  const database = await openDatabase();
  const scores = await requestValue<ScoreRecord[]>(
    database
      .transaction("scores", "readonly")
      .objectStore("scores")
      .index("mapId")
      .getAll(mapId),
  );
  return scores
    .filter((score) => mapRevision === undefined || score.mapRevision === mapRevision)
    .sort(
      (a, b) =>
        b.kills - a.kills ||
        b.phase - a.phase ||
        a.elapsedSeconds - b.elapsedSeconds ||
        b.playedAt - a.playedAt,
    );
}

export function exportMapJson(map: StoredMap) {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...portable } = map;
  return JSON.stringify(portable, null, 2);
}

export function importMapJson(text: string) {
  const parsed = JSON.parse(text) as Partial<StoredMap>;
  return createStoredMap(
    typeof parsed.name === "string" ? `${parsed.name} 가져옴` : "가져온 전장",
    validateMapData(parsed),
  );
}
