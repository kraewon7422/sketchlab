/**
 * 팜 리젝션 — 손바닥이 화면에 닿아도 획이 생기지 않게 한다 (§12.4).
 *
 * 규칙은 두 가지이고, 둘 다 이유가 있다.
 *
 * 1) 펜 감지 잠금
 *    이 세션에서 스타일러스를 한 번이라도 쓴 기기라면, 그 뒤로 손가락 접촉은
 *    "그리기"가 아니다. 필기 중에 손이 닿는 것이거나 팬 제스처다.
 *    §12.2의 "펜 감지 시 손가락은 팬"이 바로 이 규칙이다.
 *    잠금을 시간 제한 없이 세션 내내 유지하는 이유: 손바닥은 펜보다 먼저 닿는
 *    경우가 많아서, 짧은 타임아웃을 쓰면 그 순간에 팜이 통과해 버린다.
 *
 * 2) 접촉면 크기
 *    펜을 쓰지 않는 기기에서도 손바닥은 걸러야 한다. 손가락 끝은 보통 20~30px,
 *    손바닥은 그보다 훨씬 넓게 잡힌다.
 *
 * 상태가 있으므로(펜을 본 적 있는지) 팩토리로 만들되, 판정 로직 자체는
 * 외부 입력에만 의존해서 테스트 가능하게 둔다.
 */

export interface PointerSample {
  pointerType: string;
  /** 접촉면 폭 px. 지원하지 않는 브라우저는 1을 준다. */
  width: number;
  height: number;
  isPrimary: boolean;
}

export type RejectReason =
  | "ok"
  /** 보조 포인터 — 멀티터치의 두 번째 손가락 */
  | "not-primary"
  /** 펜을 쓰는 기기에서의 손가락 접촉 */
  | "touch-while-pen-mode"
  /** 접촉면이 너무 넓음 — 손바닥 */
  | "contact-too-large";

export interface PalmRejectorOptions {
  /** 이보다 넓은 접촉면은 손바닥으로 본다 (px) */
  maxContactSize?: number;
}

export interface PalmRejector {
  /** 이 포인터로 그려도 되는지 판정한다. 부수효과로 펜 사용 여부를 기록한다. */
  evaluate(sample: PointerSample): RejectReason;
  /** 펜이 감지된 적 있는가 — 손가락을 팬으로 돌릴지 판단하는 데 쓴다. */
  isPenMode(): boolean;
  reset(): void;
}

const DEFAULT_MAX_CONTACT = 40;

export function createPalmRejector(options: PalmRejectorOptions = {}): PalmRejector {
  const maxContact = options.maxContactSize ?? DEFAULT_MAX_CONTACT;
  let penSeen = false;

  return {
    evaluate(sample) {
      if (sample.pointerType === "pen") {
        // 판정보다 먼저 기록한다. isPrimary가 아니어도 "펜이 있는 기기"라는 사실은 참이다.
        penSeen = true;
      }

      if (!sample.isPrimary) return "not-primary";

      if (sample.pointerType === "pen") return "ok";

      // 마우스는 데스크톱 입력이므로 항상 통과시킨다.
      if (sample.pointerType === "mouse") return "ok";

      if (penSeen) return "touch-while-pen-mode";

      if (sample.width > maxContact || sample.height > maxContact) {
        return "contact-too-large";
      }

      return "ok";
    },

    isPenMode() {
      return penSeen;
    },

    reset() {
      penSeen = false;
    },
  };
}
