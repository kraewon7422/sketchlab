/* global self, caches, URL, fetch, Response */
/*
 * SketchLab 오프라인 지원 (제안 #12) — 손으로 쓴 작은 서비스 워커 (라이브러리 없음).
 *
 *   페이지(index.html): 먼저 인터넷 → 안 되면 저장해 둔 것 (새 버전이 바로 반영되도록)
 *   그 밖의 같은 사이트 파일(해시가 붙은 JS·CSS·폰트·RDKit WASM): 저장해 둔 것 먼저, 없으면 받아서 저장
 *   다른 사이트(AI·PubChem): 손대지 않는다 — 항상 인터넷으로
 *
 * 한 번 써 본 기능의 파일만 저장된다 (한글 폰트 조각 93개를 미리 다 받지 않는다).
 */
const CACHE = "sketchlab-v1";
const SHELL = ["./", "./manifest.webmanifest", "./icon-192.png"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => undefined));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./", copy));
          return res;
        })
        .catch(() => caches.match("./").then((r) => r || Response.error())),
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
