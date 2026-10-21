/**
 * 브라우저용 "stream" 자리 채우기 — C·C++ 실행기(JSCPP)가 쓰는 printf 꾸러미가
 * `x instanceof require("stream").Stream` 으로 출력 대상을 확인한다. 브라우저에는 stream이 없어
 * Stream이 undefined → instanceof가 던진다. 빈 Stream 클래스면 "스트림 아님"으로 넘어간다.
 */
export class Stream {}
export default { Stream };
