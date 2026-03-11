import { getVideoInfo, getVideoSubtitle } from "./src/bilibili/client";
import * as dotenv from "dotenv";
import path from "path";
import fs from "fs";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const bvid = "BV1T6PQzQErF";
  try {
    const info = await getVideoInfo(bvid);
    const cid = info.cid;
    const subtitleData = await getVideoSubtitle(bvid, cid);
    fs.writeFileSync("subtitle_data.json", JSON.stringify(subtitleData, null, 2));
    console.log("Saved to subtitle_data.json");
  } catch (err) {
    console.error("Error:", err);
  }
}

main();
