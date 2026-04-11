import { credentialManager } from "../utils/credentials.js";
import { checkLoginStatus } from "./client.js";

export class BilibiliAuth {
  static async initialize(): Promise<void> {
    await credentialManager.initialize();
  }

  static async checkLoginStatus(): Promise<boolean> {
    const result = await checkLoginStatus();
    return result.isLogin;
  }

  static getStatus() {
    return credentialManager.getStatus();
  }
}
