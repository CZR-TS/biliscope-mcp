import { getVideoInfoWithSubtitle } from "./src/bilibili/subtitle";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const bvid = "BV1T6PQzQErF";
  try {
    const data = await getVideoInfoWithSubtitle(bvid, "zh-Hans");
    console.log("Data Source:", data.data_source);
    if (data.data_source === "subtitle" && data.video_info.subtitle_text) {
      console.log("Subtitle Text (first 100 chars):", data.video_info.subtitle_text.substring(0, 100));
    } else {
      console.log("No subtitle text returned. Video Info:", data.video_info);
    }
  } catch (err) {
    console.error("Error occurred:", err);
  }
}

main();
