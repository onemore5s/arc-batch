import fs from "node:fs";
import path from "node:path";
import solc from "solc";
import { keccak256, toHex } from "viem";
import { COMPILATION } from "../src/config.ts";
const directory = "contracts/src";
fs.mkdirSync("contracts/lib/openzeppelin", { recursive: true });
fs.cpSync(
  "node_modules/@openzeppelin/contracts",
  "contracts/lib/openzeppelin/contracts",
  { recursive: true },
);
const sources = Object.fromEntries(
  fs
    .readdirSync(directory)
    .filter((f) => f.endsWith(".sol"))
    .map((f) => [
      f,
      { content: fs.readFileSync(path.join(directory, f), "utf8") },
    ]),
);
const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: COMPILATION.optimizerRuns },
    evmVersion: COMPILATION.evmVersion,
    outputSelection: {
      "*": { "*": ["abi", "evm.bytecode", "evm.deployedBytecode"] },
    },
  },
};
const dependencies = {};
const output = JSON.parse(
  solc.compile(JSON.stringify(input), {
    import(file) {
      const contents = fs.readFileSync(path.join("node_modules", file), "utf8");
      dependencies[file] = { content: contents };
      return { contents };
    },
  }),
);
for (const error of output.errors ?? []) {
  if (error.severity === "error") throw new Error(error.formattedMessage);
}
const built = output.contracts["ArcRewardDistributor.sol"].ArcRewardDistributor;
fs.mkdirSync("src/generated", { recursive: true });
fs.mkdirSync("artifacts", { recursive: true });
fs.writeFileSync(
  "src/generated/abi.ts",
  `// Generated from Solidity build artifacts. Do not edit manually.\nexport const distributorAbi = ${JSON.stringify(built.abi, null, 2)} as const;\n`,
);
input.sources = { ...sources, ...dependencies };
fs.writeFileSync(
  "artifacts/distributor.json",
  JSON.stringify(
    {
      abi: built.abi,
      bytecode: `0x${built.evm.bytecode.object}`,
      compiler: solc.version(),
      evmVersion: input.settings.evmVersion,
      sourceHash: keccak256(toHex(JSON.stringify(input.sources))),
      input,
    },
    null,
    2,
  ) + "\n",
);
fs.writeFileSync(
  "artifacts/compiler-input.json",
  JSON.stringify(input, null, 2) + "\n",
);
console.log("Contract compilation and ABI generation completed");
