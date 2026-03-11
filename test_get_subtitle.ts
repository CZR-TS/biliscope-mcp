import { getSubtitleContent } from "./src/bilibili/client";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  const url = "//aisubtitle.hdslb.com/bfs/ai_subtitle/prod/116198679321943259772327144d22191bbc4d31a294b566261356ae72?auth_key=1773186124-24155630a36244f1b6076b522c70b025-0-ab7fc4ee9a47a3e919209de34a1778a9";
  
  try {
    console.log(`Downloading subtitle from ${url}...`);
    const content = await getSubtitleContent(url);
    console.log("Success! Body length:", content.body?.length);
    if (content.body?.length > 0) {
      console.log("Sample:", content.body[0]);
    } else {
      console.log("Empty body.");
    }
  } catch (err) {
    console.error("Error occurred:", err);
  }
}

main();
