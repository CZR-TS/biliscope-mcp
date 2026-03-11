import { fetchWithoutWBI } from './dist/bilibili/client.js';
import { credentialManager } from './dist/utils/credentials.js';
import 'dotenv/config';

async function main() {
  try {
    const authHeaders = credentialManager.getAuthHeaders();
    console.log('Sending request to /x/web-interface/nav');
    const navData = await typeof fetch !== 'undefined' ? await fetch('https://api.bilibili.com/x/web-interface/nav', { headers: authHeaders }).then(r => r.json()) : null;
    console.log('Login status:', navData.data.isLogin ? 'Logged In' : 'Not Logged In', 'Username:', navData.data.uname);
  } catch (err) {
    console.error(err);
  }
}
main();
