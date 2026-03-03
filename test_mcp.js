
import { spawn } from 'child_process';

const MCP_PATH = 'c:\\Users\\ZX\\bilibili-mcp\\dist\\index.js';
const BVID = process.argv[2] || 'BV1CgPMzpE2s';

async function callTool(child, id, name, args) {
  return new Promise((resolve, reject) => {
    const request = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args }
    };

    child.stdin.write(JSON.stringify(request) + '\n');

    const timeout = setTimeout(() => {
      reject(new Error(`Tool call '${name}' timed out after 30s`));
    }, 30000);

    const handler = (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const res = JSON.parse(line);
          if (res.id === id) {
            clearTimeout(timeout);
            child.stdout.removeListener('data', handler);
            resolve(res.result);
          }
        } catch (e) {}
      }
    };

    child.stdout.on('data', handler);
  });
}

async function main() {
  const child = spawn('node', [MCP_PATH], {
    env: {
      ...process.env,
    }
  });

  const serverLogs = [];
  child.stderr.on('data', (data) => {
    serverLogs.push(data.toString().trim());
  });

  // Step 1: MCP Initialize handshake
  await new Promise((resolve, reject) => {
    const initReq = {
      jsonrpc: '2.0',
      id: 0,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    };

    const timeout = setTimeout(() => reject(new Error('Initialize timed out')), 10000);

    child.stdout.on('data', function handler(data) {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const res = JSON.parse(line);
          if (res.id === 0) {
            clearTimeout(timeout);
            child.stdout.removeListener('data', handler);
            child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
            resolve();
          }
        } catch (e) {}
      }
    });

    child.stdin.write(JSON.stringify(initReq) + '\n');
  });

  console.log('✅ MCP handshake completed\n');

  try {
    console.log('--- VIDEO INFO ---');
    const info = await callTool(child, 1, 'get_video_info', { bvid_or_url: BVID, preferred_lang: 'zh-Hans' });
    if (info?.isError) {
      console.log('⚠️  ERROR RESPONSE:');
      const content = info?.content?.[0]?.text;
      console.log(content);
      console.log('\nServer logs:');
      serverLogs.slice(-20).forEach(l => console.log(' SERVER:', l));
    } else {
      const text = info?.content?.[0]?.text;
      const parsed = JSON.parse(text || '{}');
      console.log('data_source:', parsed.data_source);
      console.log('title:', parsed.video_info?.title);
      console.log('description (first 80):', parsed.video_info?.description?.substring(0, 80));
      console.log('subtitle_text (first 100):', parsed.video_info?.subtitle_text?.substring(0, 100));
    }

    console.log('\n--- COMMENTS ---');
    const comments = await callTool(child, 2, 'get_video_comments', { bvid_or_url: BVID, detail_level: 'brief' });
    if (comments?.isError) {
      console.log('⚠️  ERROR RESPONSE:');
      const content = comments?.content?.[0]?.text;
      console.log(content);
    } else {
      const text = comments?.content?.[0]?.text;
      const parsed = JSON.parse(text || '{}');
      console.log('total_comments:', parsed.summary?.total_comments);
      console.log('comments_with_timestamp:', parsed.summary?.comments_with_timestamp);
      if (parsed.comments?.length > 0) {
        console.log('\nFirst 3 comments:');
        parsed.comments.slice(0, 3).forEach((c, i) => {
          console.log(`  [${i+1}] ${c.author} (${c.likes} likes): ${c.content?.substring(0, 60)}`);
        });
      }
    }
  } catch (e) {
    console.error('Error:', e.message);
    console.log('\nServer logs:');
    serverLogs.slice(-20).forEach(l => console.log(' SERVER:', l));
  }

  child.kill();
}

main().catch(console.error);
