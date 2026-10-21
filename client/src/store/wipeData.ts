import { disconnectDrive, validToken, wipeDriveAppFolder } from "../sync/drive";
import { deleteDatabase } from "./db";

/**
 * "내 데이터 모두 지우기" — 앱 마켓(구글 플레이·앱 스토어)이 요구하는 데이터 삭제.
 *   이 기기: 노트·쪽·사진·PDF 그림(IndexedDB), 펜 설정·AI 설정(키 포함)·Drive 연결 정보(localStorage의 sketchlab.*)
 *   Google Drive (고르면): SketchLab 앱 폴더의 모든 파일 — 앱 폴더 밖의 Drive 파일은 앱이 볼 수도, 지울 수도 없다
 * 같은 주소(kraewon7422.github.io)의 다른 프로젝트 저장소는 건드리지 않는다 (sketchlab. 로 시작하는 것만).
 * 끝나면 화면을 새로 고쳐야 한다 (지운 뒤에는 저장이 멈춰 있다).
 */
export interface WipeReport {
  driveFiles: number;
  /** 다른 탭이 저장소를 쥐고 있어 그 탭이 닫히면 지워진다 */
  blocked: boolean;
}

export async function deleteAllData(opts: { drive: boolean }, store: Storage | null = typeof localStorage === "undefined" ? null : localStorage): Promise<WipeReport> {
  let driveFiles = 0;
  if (opts.drive) {
    const token = validToken();
    if (!token) throw new Error("Drive 연결이 만료됐어요 · 다시 연결한 뒤 지워 주세요");
    driveFiles = await wipeDriveAppFolder(token);
  }
  // 출입증을 Google에 돌려주고 연결 정보도 지운다
  await disconnectDrive();
  const result = await deleteDatabase();
  if (store) {
    const keys: string[] = [];
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k && (k === "sketchlab" || k.startsWith("sketchlab."))) keys.push(k);
    }
    for (const k of keys) store.removeItem(k);
  }
  return { driveFiles, blocked: result === "blocked" };
}
