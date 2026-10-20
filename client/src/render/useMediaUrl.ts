import { useEffect, useState } from "react";
import { cachedMediaUrl, mediaUrl } from "../store/media";

/** 사진 파일 id → 화면에 쓸 주소 (처음 한 번 불러오고 나면 바로) */
export function useMediaUrl(id: string | undefined): string | undefined {
  const [url, setUrl] = useState(() => (id ? cachedMediaUrl(id) : undefined));
  useEffect(() => {
    if (!id) return;
    const hit = cachedMediaUrl(id);
    if (hit) {
      setUrl(hit);
      return;
    }
    let alive = true;
    void mediaUrl(id).then((u) => {
      if (alive && u) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return url;
}
