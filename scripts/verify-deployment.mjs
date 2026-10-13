import fs from "node:fs";
import { networkClient, verifyManifest } from "./deployment-utils.mjs";
const file = process.argv[2];
if (!file) throw new Error("Provide the path to an actual deployment manifest");
await verifyManifest(
  JSON.parse(fs.readFileSync(file, "utf8")),
  networkClient().client,
);
console.log(
  "Deployment transaction, constructor arguments, code hash, and version verified",
);
