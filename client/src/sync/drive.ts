import type { Remote, RemoteLibrary } from "./remote";

/**
 * 동기화 저장소 = 사용자 자신의 Google Drive (9단계).
 *
 * 노트는 이 기기에서 사용자의 Drive로 바로 간다 — 중간에 앱 만든 사람의 서버가 없다 (이메일도 노트도 거치지 않는다).
 * 권한은 drive.appdata 하나: Drive 안의 숨은 "앱 전용 폴더"만 쓸 수 있다 (사용자의 다른 파일은 볼 수 없다).
 *
 *   library.json          노트 목록·폴더 (sync.ts의 RemoteLibrary)
 *   <note id>.sketchlab   노트마다 하나 (앱의 노트 파일과 같은 zip)
 *
 * 로그인은 Google의 창(Google Identity Services)이 하고, 받은 출입증(1시간짜리)은 이 기기에만 둔다.
 * 앱 ID(VITE_GOOGLE_CLIENT_ID)는 빌드 설정에서 — 앱을 가리킬 뿐 누구의 계정도 아니다.
 */

const SCOPE = "https://www.googleapis.com/auth/drive.appdata";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const STATE_KEY = "sketchlab.drive";

export class NeedsAuth extends Error {}

/** 이 기기에 둔 연결 정보 (출입증·만료 시각·내 이름 — 이 기기 밖으로 나가지 않는다) */
interface DriveState {
  token?: string;
  expiresAt?: number;
  userId?: string;
  name?: string;
}

export function driveState(): DriveState | null {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) ?? "null") as DriveState | null;
  } catch {
    return null;
  }
}
function saveState(s: DriveState | null): void {
  try {
    if (s) localStorage.setItem(STATE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STATE_KEY);
  } catch {
    /* 저장이 막힌 브라우저 — 이번만 */
  }
}

export const driveClientId = (): string => (import.meta.env["VITE_GOOGLE_CLIENT_ID"] as string | undefined)?.trim() ?? "";
export const driveAvailable = (): boolean => driveClientId().length > 0;

// ─────────────────────────────────────────────────────────── Google 로그인 창

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
}
interface TokenClient {
  requestAccessToken(o?: { prompt?: string }): void;
}
declare global {
  interface Window {
    google?: { accounts: { oauth2: { initTokenClient(o: { client_id: string; scope: string; callback: (r: TokenResponse) => void; error_callback?: (e: { type?: string }) => void }): TokenClient; revoke(token: string, done?: () => void): void } } };
  }
}

let gis: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  gis ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gis = null;
      reject(new Error("Google 로그인을 불러오지 못했어요 · 인터넷을 확인해 주세요"));
    };
    document.head.appendChild(s);
  });
  return gis;
}

/** Google 창을 띄워 출입증을 받는다 — 반드시 사용자가 누른 순간에 (아니면 브라우저가 창을 막는다) */
export async function connectDrive(first: boolean): Promise<void> {
  const clientId = driveClientId();
  if (!clientId) throw new Error("이 앱에는 Google Drive 연결이 설정되어 있지 않아요");
  await loadGis();
  const oauth = window.google?.accounts.oauth2;
  if (!oauth) throw new Error("Google 로그인을 불러오지 못했어요");
  const r = await new Promise<TokenResponse>((resolve, reject) => {
    const client = oauth.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: resolve,
      error_callback: (e) => reject(new Error(e.type === "popup_closed" ? "연결을 취소했어요" : "Google 창을 열지 못했어요 · 팝업 차단을 확인해 주세요")),
    });
    client.requestAccessToken({ prompt: first ? "consent" : "" });
  });
  if (!r.access_token) throw new Error(r.error === "access_denied" ? "Drive 사용을 허락하지 않았어요" : "연결하지 못했어요");
  const token = r.access_token;
  const about = (await (await driveFetch(token, `${API}/about?fields=user(permissionId,displayName)`)).json()) as { user?: { permissionId?: string; displayName?: string } };
  const prev = driveState();
  saveState({ ...prev, token, expiresAt: Date.now() + ((r.expires_in ?? 3600) - 120) * 1000, userId: about.user?.permissionId ?? prev?.userId ?? "drive", name: about.user?.displayName ?? "" });
}

/** 연결 끊기 — 출입증을 Google에 돌려주고 이 기기의 연결 정보를 지운다 (Drive의 노트는 그대로) */
export async function disconnectDrive(): Promise<void> {
  const s = driveState();
  if (s?.token) {
    try {
      await loadGis();
      window.google?.accounts.oauth2.revoke(s.token);
    } catch {
      /* 인터넷이 없어도 이 기기에서는 끊는다 */
    }
  }
  saveState(null);
}

/** 지금 쓸 수 있는 출입증 (없거나 만료면 null — 화면이 "다시 연결" 단추를 보여 준다) */
export function validToken(): string | null {
  const s = driveState();
  return s?.token && (s.expiresAt ?? 0) > Date.now() ? s.token : null;
}

// ─────────────────────────────────────────────────────────── Drive 앱 폴더

type Fetch = typeof fetch;

async function driveFetch(token: string, url: string, init: RequestInit = {}, f: Fetch = fetch): Promise<Response> {
  const res = await f(url, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    const s = driveState();
    if (s) saveState({ ...s, token: undefined, expiresAt: 0 });
    throw new NeedsAuth("Google Drive 연결이 만료됐어요 · 다시 연결을 눌러 주세요");
  }
  if (res.status === 403) throw new Error("Google Drive가 거절했어요 (권한 또는 사용량 한도) · 잠시 뒤에 다시 해 주세요");
  if (!res.ok) throw new Error(`Google Drive 오류 (${res.status})`);
  return res;
}

/** 앱 폴더의 Remote. fetch를 바꿔 끼우면 시험할 수 있다 */
export function driveRemote(token: string, userId: string, f: Fetch = fetch): Remote {
  const call = (url: string, init?: RequestInit) => driveFetch(token, url, init, f);
  let index: Map<string, string> | null = null;
  const files = async (): Promise<Map<string, string>> => {
    if (index) return index;
    const map = new Map<string, string>();
    let page = "";
    do {
      const r = (await (await call(`${API}/files?spaces=appDataFolder&fields=nextPageToken,files(id,name)&pageSize=1000${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`)).json()) as { files?: Array<{ id: string; name: string }>; nextPageToken?: string };
      for (const x of r.files ?? []) map.set(x.name, x.id);
      page = r.nextPageToken ?? "";
    } while (page);
    index = map;
    return map;
  };
  const put = async (name: string, body: Blob): Promise<void> => {
    const id = (await files()).get(name);
    if (id) {
      await call(`${UPLOAD}/files/${id}?uploadType=media`, { method: "PATCH", headers: { "Content-Type": body.type || "application/octet-stream" }, body });
      return;
    }
    const boundary = `sketchlab${Math.random().toString(36).slice(2)}`;
    const meta = JSON.stringify({ name, parents: ["appDataFolder"] });
    const multipart = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${body.type || "application/octet-stream"}\r\n\r\n`, body, `\r\n--${boundary}--`]);
    const r = (await (await call(`${UPLOAD}/files?uploadType=multipart&fields=id`, { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: multipart })).json()) as { id?: string };
    if (r.id) (await files()).set(name, r.id);
  };
  const get = async (name: string): Promise<Blob | null> => {
    const id = (await files()).get(name);
    return id ? await (await call(`${API}/files/${id}?alt=media`)).blob() : null;
  };
  return {
    userId,
    async getLibrary() {
      const b = await get("library.json");
      if (!b) return null;
      const d = JSON.parse(await b.text()) as Partial<RemoteLibrary>;
      return d.notes ? { v: 1, notes: d.notes, folders: d.folders ?? {} } : null;
    },
    async putLibrary(lib) {
      await put("library.json", new Blob([JSON.stringify(lib)], { type: "application/json" }));
    },
    async upload(noteId, file) {
      await put(`${noteId}.sketchlab`, new Blob([file], { type: "application/zip" }));
    },
    async download(noteId) {
      const b = await get(`${noteId}.sketchlab`);
      if (!b) throw new Error("Drive에 노트 파일이 없어요");
      return b;
    },
    async remove(noteIds) {
      const map = await files();
      for (const n of noteIds) {
        const id = map.get(`${n}.sketchlab`);
        if (!id) continue;
        await call(`${API}/files/${id}`, { method: "DELETE" });
        map.delete(`${n}.sketchlab`);
      }
    },
  };
}

/**
 * 앱 폴더를 통째로 비운다 ("내 데이터 모두 지우기") — 이 앱이 Drive에 만든 파일만 (앱 폴더 밖은 볼 수도 없다).
 * 반환: 지운 파일 수
 */
export async function wipeDriveAppFolder(token: string, f: Fetch = fetch): Promise<number> {
  let n = 0;
  // 지우면서 목록이 줄어드니, 빌 때까지 처음부터 다시 읽는다 (한 번에 1000개)
  for (let round = 0; round < 50; round++) {
    const r = (await (await driveFetch(token, `${API}/files?spaces=appDataFolder&fields=files(id)&pageSize=1000`, {}, f)).json()) as { files?: Array<{ id: string }> };
    const ids = (r.files ?? []).map((x) => x.id);
    if (ids.length === 0) break;
    for (const id of ids) {
      await driveFetch(token, `${API}/files/${id}`, { method: "DELETE" }, f);
      n++;
    }
  }
  return n;
}

/** 연결되어 있고 출입증이 살아 있으면 그 Remote, 아니면 null */
export function currentDriveRemote(): Remote | null {
  const token = validToken();
  const s = driveState();
  return token && s?.userId ? driveRemote(token, s.userId) : null;
}
