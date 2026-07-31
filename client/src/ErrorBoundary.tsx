import { Component, type ErrorInfo, type ReactNode } from "react";
import { debugLog } from "./debug";
import { theme } from "./render/theme";

interface Props {
  children: ReactNode;
  /** 어느 영역이 죽었는지 구분하는 이름. 예: "canvas", "sheet" */
  area: string;
}

interface State {
  error: Error | null;
}

/**
 * 렌더 중 던져진 에러를 잡아 앱 전체가 백지가 되는 것을 막는다 (D7).
 *
 * 규약 §2-6대로 에러를 삼키지 않는다 — 화면에 카드로 보여주고 debug 로그에도 남긴다.
 * React 에러 바운더리는 클래스 컴포넌트로만 만들 수 있다.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    debugLog.error(
      `render:${this.props.area}`,
      error.message,
      `${error.stack ?? ""}\n--- 컴포넌트 스택 ---${info.componentStack ?? ""}`,
    );
  }

  private readonly reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        role="alert"
        style={{
          margin: theme.space[4],
          padding: theme.space[5],
          borderRadius: theme.radius.m,
          border: `1px solid ${theme.color.sub}`,
          background: theme.color.bg,
          color: theme.color.ink,
          fontFamily: theme.font.ui,
        }}
      >
        <p style={{ fontWeight: 600, marginBottom: theme.space[2] }}>
          이 부분을 표시하지 못했어요
        </p>
        <p style={{ color: theme.color.danger, fontSize: 14, marginBottom: theme.space[4] }}>
          {error.message}
        </p>
        <button
          type="button"
          onClick={this.reset}
          style={{
            minHeight: theme.touch.minTarget,
            padding: `0 ${theme.space[4]}px`,
            borderRadius: theme.radius.s,
            border: `1px solid ${theme.color.accent}`,
            background: "transparent",
            color: theme.color.accent,
            cursor: "pointer",
          }}
        >
          다시 시도
        </button>
      </div>
    );
  }
}
