import { getVideoInfo, getVideoSubtitle } from "./dist/bilibili/client.js";
import { credentialManager } from "./dist/utils/credentials.js";
import "dotenv/config";

async function main() {
  try {
    console.log("Auth check:", credentialManager.getAuthHeaders());
    const videoInfo = await getVideoInfo("BV1SzPQzpEP8");
    console.log("Title:", videoInfo.title, "CID:", videoInfo.cid);
    const subtitle = await getVideoSubtitle("BV1SzPQzpEP8", videoInfo.cid);
    console.log("Subtitles data:\n", JSON.stringify(subtitle, null, 2));
  } catch (err) {
    console.error(err);
  }
}
main();
