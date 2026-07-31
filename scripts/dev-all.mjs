// 클라이언트와 서버 개발 서버를 함께 띄운다.
//
// concurrently 같은 의존성을 추가하지 않고 Node 기본 기능만 쓴다.
// Windows에서 npm 스크립트의 `&` / `&&` 동작이 셸마다 달라서
// 스크립트로 명시하는 편이 예측 가능하다.

import { spawn } from "node:child_process";
import process from "node:process";

/** @type {{ name: string, workspace: string, color: string }[]} */
const TARGETS = [
  { name: "client", workspace: "client", color: "\x1b[36m" }, // cyan
  { name: "server", workspace: "server", color: "\x1b[35m" }, // magenta
];

const RESET = "\x1b[0m";
const children = [];
let shuttingDown = false;

for (const target of TARGETS) {
  const child = spawn("npm", ["run", "dev", "--workspace", target.workspace], {
    // Windows에서 npm은 npm.cmd 라 셸을 거쳐야 한다.
    shell: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  prefix(child.stdout, target);
  prefix(child.stderr, target);

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    console.log(
      `${target.color}[${target.name}]${RESET} 종료됨 (code=${code ?? "null"}, signal=${signal ?? "none"})`,
    );
    // 한쪽이 죽으면 다른 쪽도 정리한다. 반쪽만 살아있는 상태가 더 헷갈린다.
    shutdown(code ?? 1);
  });

  children.push(child);
}

/**
 * @param {import("node:stream").Readable | null} stream
 * @param {{ name: string, color: string }} target
 */
function prefix(stream, target) {
  if (!stream) return;
  stream.setEncoding("utf8");
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      console.log(`${target.color}[${target.name}]${RESET} ${line}`);
    }
  });
}

/** @param {number} code */
function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (child.exitCode === null) child.kill();
  }
  process.exitCode = code;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}
