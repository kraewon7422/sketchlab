/** JSCPP (C++ 해석기) — 타입 정의가 없어 쓰는 것만 */
declare module "JSCPP" {
  interface JscppConfig {
    stdio?: { write?: (s: string) => void };
  }
  const JSCPP: { run(code: string, input: string, config?: JscppConfig): number };
  export default JSCPP;
}
