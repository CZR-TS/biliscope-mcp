import { checkLoginStatus } from "./src/bilibili/client";
import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

async function main() {
  console.log("Checking login status with current .env...");
  try {
    const result = await checkLoginStatus();
    console.log("Result:", JSON.stringify(result, null, 2));
    if (!result.isLogin) {
      console.log("Conclusion: Cookie IS expired or missing.");
    } else {
      console.log("Conclusion: Cookie IS valid.");
    }
  } catch (error) {
    console.error("Error during check:", error);
  }
}

main();
