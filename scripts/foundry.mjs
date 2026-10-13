import { spawn } from "node:child_process";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const [tool, ...args] = process.argv.slice(2);
const arcMode = tool === "forge" && args.includes("arc");
if (arcMode && !process.env.ARC_FORGE)
  throw new Error("Set ARC_FORGE to a verified Arc Foundry forge binary");
const architecture = process.arch === "x64" ? "amd64" : process.arch;
const binary = arcMode
  ? process.env.ARC_FORGE
  : require.resolve(
      `@foundry-rs/${tool}-${process.platform}-${architecture}/bin/${tool}${process.platform === "win32" ? ".exe" : ""}`,
    );
const child = spawn(binary, args, { stdio: "inherit" });
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code, signal) => {
  process.exitCode = code ?? 1;
  if (signal) console.error(`Tool terminated:${signal}`);
});
