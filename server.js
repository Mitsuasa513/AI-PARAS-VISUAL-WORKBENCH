const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const STRATA_API_KEY = process.env.STRATA_API_KEY || '';
const strataHeaders = STRATA_API_KEY ? { Authorization: `Bearer ${STRATA_API_KEY}` } : {};
const VLLM_API_KEY = process.env.VLLM_API_KEY || '';
const vllmHeaders = VLLM_API_KEY ? { Authorization: `Bearer ${VLLM_API_KEY}` } : {};
const ROOT = __dirname;
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.otf': 'font/otf',
};
const DEFAULT_BACKEND_SETTINGS = Object.freeze({
  vllmUrl: process.env.VLLM_URL || 'http://127.0.0.1:8080',
  strataUrl: process.env.STRATA_URL || 'http://127.0.0.1:8081',
  mayaUrl: process.env.MAYA_URL || 'http://127.0.0.1:8082',
  llamaUrl: process.env.LLAMA_URL || 'http://127.0.0.1:8089',
  lmStudioUrl: process.env.LMSTUDIO_URL || 'http://127.0.0.1:1234',
});
const BACKEND_SETTING_KEYS = Object.keys(DEFAULT_BACKEND_SETTINGS);
const backendSettingsPath = process.env.WORKBENCH_SETTINGS_PATH || path.join(ROOT, '.workbench-settings.json');

function normalizeBackendUrl(value, fallback) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return fallback;
  let url;
  try {
    url = new URL(text);
  } catch (_) {
    throw new Error('后端地址格式不正确');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只支持 http/https 地址');
  if (url.username || url.password) throw new Error('后端地址不能包含用户名或密码');
  return url.href.replace(/\/+$/, '');
}

function normalizeBackendSettings(input = {}) {
  return Object.fromEntries(
    BACKEND_SETTING_KEYS.map((key) => [
      key,
      normalizeBackendUrl(input[key], DEFAULT_BACKEND_SETTINGS[key]),
    ]),
  );
}

function loadBackendSettings() {
  try {
    const saved = JSON.parse(fs.readFileSync(backendSettingsPath, 'utf8'));
    return normalizeBackendSettings(saved);
  } catch (_) {
    return { ...DEFAULT_BACKEND_SETTINGS };
  }
}

let backendSettings = loadBackendSettings();

function saveBackendSettings(input) {
  const normalized = normalizeBackendSettings(input);
  const tmp = `${backendSettingsPath}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, backendSettingsPath);
  backendSettings = normalized;
  return normalized;
}

function backendSettingsPayload() {
  return {
    values: { ...backendSettings },
    defaults: { ...DEFAULT_BACKEND_SETTINGS },
  };
}

const BACKEND_TEST_TARGETS = Object.freeze({
  vllmUrl: { name: 'vLLM', path: '/v1/models', headers: () => vllmHeaders },
  strataUrl: { name: 'Strata', path: '/v1/status', headers: () => strataHeaders },
  mayaUrl: { name: 'Maya', path: '/v1/status', headers: () => strataHeaders },
  llamaUrl: { name: 'llama.cpp', path: '/v1/models', headers: () => ({}) },
  lmStudioUrl: { name: 'LM Studio', path: '/api/v1/models', headers: () => ({}) },
});
const previousMetrics = new Map();
const previousVllmMetrics = new Map();
const lastVllmSpeeds = new Map();
const previousLlamaSlots = new Map();
let lastLlamaProbeAt = null;
// llama.cpp 的 /slots 在请求完成后会把 is_processing 置为 false，
// 此时接口不再提供速度。保留最近一次有效采样，方便界面继续观察。
const llamaMetricsCachePath = path.join(ROOT, '.llama-metrics-cache.json');
let lastLlamaMetrics = (() => {
  try {
    const cached = JSON.parse(fs.readFileSync(llamaMetricsCachePath, 'utf8'));
    return {
      promptSpeed: Number.isFinite(cached.promptSpeed) ? cached.promptSpeed : null,
      generationSpeed: Number.isFinite(cached.generationSpeed) ? cached.generationSpeed : null,
      taskId: cached.taskId ?? null,
      model: cached.model || null,
      at: Number(cached.at) || 0,
    };
  } catch (_) {
    return { promptSpeed: null, generationSpeed: null, taskId: null, model: null, at: 0 };
  }
})();

function saveLlamaMetricsCache() {
  try { fs.writeFileSync(llamaMetricsCachePath, JSON.stringify(lastLlamaMetrics), 'utf8'); } catch (_) {}
}

// LM Studio 按天写服务器日志，所以“今日累计”可以直接读日志；llama.cpp 与 Strata 没有这种日志，
// 但它们都提供“自启动以来”的累计 token 计数（llama.cpp 的 /metrics、Strata 的 /metrics.totals）。
// 这里持续对计数求差，再按本机日期累加进 .daily-tokens.json，即可得到同样的今日累计。
const dailyTokensPath = path.join(ROOT, '.daily-tokens.json');
const activeBackends = new Map();
let dailyTokens = (() => {
  try {
    const cached = JSON.parse(fs.readFileSync(dailyTokensPath, 'utf8'));
    return {
      date: typeof cached.date === 'string' ? cached.date : null,
      promptTokens: Number(cached.promptTokens) || 0,
      generatedTokens: Number(cached.generatedTokens) || 0,
      requests: Number(cached.requests) || 0,
      counters: cached.counters && typeof cached.counters === 'object' ? cached.counters : {},
    };
  } catch (_) {
    return { date: null, promptTokens: 0, generatedTokens: 0, requests: 0, counters: {} };
  }
})();

function saveDailyTokens() {
  try { fs.writeFileSync(dailyTokensPath, JSON.stringify(dailyTokens), 'utf8'); } catch (_) {}
}

function localDateKey(now = new Date()) {
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
}

function rollDailyTokens() {
  const today = localDateKey();
  if (dailyTokens.date !== today) {
    dailyTokens = { date: today, promptTokens: 0, generatedTokens: 0, requests: 0, counters: {} };
    activeBackends.clear();
    saveDailyTokens();
  }
}

// 一次“空闲 → 运行”的跳变记为一次请求。
function noteBackendActivity(key, active) {
  rollDailyTokens();
  const previous = activeBackends.get(key) || false;
  activeBackends.set(key, Boolean(active));
  if (active && !previous) { dailyTokens.requests += 1; saveDailyTokens(); }
}

// 用后端的累计计数求差。后端重启后计数会归零，此时只重建基准，不把旧数据重复计入。
// sinceSeconds 是后端本次启动的时间（秒）：如果它就在今天，那么“自启动以来”的累计值
// 全部属于今天，可以直接拿来当今日累计的起点，不必等下一个请求才看到数字。
function syncDailyCounters(key, promptTotal, generatedTotal, requestsTotal = null, sinceSeconds = null) {
  rollDailyTokens();
  const prompt = Number.isFinite(promptTotal) ? promptTotal : null;
  const generated = Number.isFinite(generatedTotal) ? generatedTotal : null;
  const requests = Number.isFinite(requestsTotal) ? requestsTotal : null;
  if (prompt === null && generated === null && requests === null) return;
  const previous = dailyTokens.counters[key];
  if (!previous) {
    const startedToday = Number.isFinite(sinceSeconds) && localDateKey(new Date(sinceSeconds * 1000)) === dailyTokens.date;
    if (startedToday) {
      if (prompt !== null && prompt > 0) dailyTokens.promptTokens += prompt;
      if (generated !== null && generated > 0) dailyTokens.generatedTokens += generated;
      if (requests !== null && requests > 0) dailyTokens.requests += requests;
    }
    dailyTokens.counters[key] = { promptTokens: prompt, generatedTokens: generated, requests };
    saveDailyTokens();
    return;
  }
  if (prompt !== null && Number.isFinite(previous.promptTokens) && prompt > previous.promptTokens) dailyTokens.promptTokens += prompt - previous.promptTokens;
  if (generated !== null && Number.isFinite(previous.generatedTokens) && generated > previous.generatedTokens) dailyTokens.generatedTokens += generated - previous.generatedTokens;
  if (requests !== null && Number.isFinite(previous.requests) && requests > previous.requests) dailyTokens.requests += requests - previous.requests;
  dailyTokens.counters[key] = {
    promptTokens: prompt === null ? previous.promptTokens : prompt,
    generatedTokens: generated === null ? previous.generatedTokens : generated,
    requests: requests === null ? previous.requests : requests,
  };
  saveDailyTokens();
}

// 后端只提供 /slots 增量时（llama.cpp 没开 --metrics），用每次采样拿到的 token 增量累加。
function addDailyTokens(promptDelta, generatedDelta) {
  rollDailyTokens();
  let changed = false;
  if (Number.isFinite(promptDelta) && promptDelta > 0) { dailyTokens.promptTokens += promptDelta; changed = true; }
  if (Number.isFinite(generatedDelta) && generatedDelta > 0) { dailyTokens.generatedTokens += generatedDelta; changed = true; }
  if (changed) saveDailyTokens();
}

function dailyTokensPayload(source) {
  rollDailyTokens();
  return {
    date: dailyTokens.date,
    generatedTokens: Math.round(dailyTokens.generatedTokens),
    promptTokens: Math.round(dailyTokens.promptTokens),
    totalTokens: Math.round(dailyTokens.generatedTokens + dailyTokens.promptTokens),
    requests: dailyTokens.requests,
    source,
  };
}

const previousProcess = new Map();
let conversationCache = null;
let lmStudioLogCache = null;
let lmStudioDailyCache = null;
let lmStudioProbeCache = null;
let lmStudioProbeInFlight = null;
let hostCache = null;
let hostInFlight = null;
let cpuTemperatureCache = null;
let cpuTemperatureInFlight = null;

function exec(command, args, timeout = 1200) {
  return new Promise((resolve) => execFile(command, args, { windowsHide: true, timeout }, (error, stdout) => resolve(error ? '' : stdout.trim())));
}

function selectedVersion(message) {
  if (!message) return null;
  const versions = Array.isArray(message.versions) ? message.versions : [];
  return versions[Number.isInteger(message.currentlySelected) ? message.currentlySelected : 0] || versions[0] || null;
}

function textFromContent(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((item) => typeof item === 'string' ? item : item?.text || '').join(' ').trim();
  return content?.text || '';
}

function readConversationStats() {
  try {
    const dir = path.join(process.env.USERPROFILE || os.homedir(), '.lmstudio', 'conversations');
    const files = fs.readdirSync(dir).filter((name) => name.endsWith('.conversation.json')).map((name) => {
      const fullPath = path.join(dir, name);
      return { fullPath, mtimeMs: fs.statSync(fullPath).mtimeMs };
    }).sort((a, b) => b.mtimeMs - a.mtimeMs);
    const latest = files[0];
    if (!latest) return null;
    if (conversationCache && conversationCache.path === latest.fullPath && conversationCache.mtimeMs === latest.mtimeMs) return conversationCache.value;
    const conversation = JSON.parse(fs.readFileSync(latest.fullPath, 'utf8'));
    const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    let latestStats = null;
    let latestUserText = '';
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const version = selectedVersion(messages[i]);
      if (!version) continue;
      if (!latestUserText && version.role === 'user') latestUserText = textFromContent(version.content);
      const steps = Array.isArray(version.steps) ? version.steps : [];
      for (let j = steps.length - 1; j >= 0; j -= 1) {
        if (steps[j]?.genInfo?.stats) { latestStats = steps[j].genInfo.stats; break; }
      }
      if (latestStats) break;
    }
    const userLast = Number(conversation.userLastMessagedAt) || 0;
    const assistantLast = Number(conversation.assistantLastMessagedAt) || 0;
    const stats = latestStats || {};
    const promptTokens = Number(stats.promptTokensCount);
    const predictedTokens = Number(stats.predictedTokensCount);
    const totalTokens = Number(stats.totalTokensCount);
    const generationSpeed = Number(stats.tokensPerSecond);
    const ttft = Number(stats.timeToFirstTokenSec);
    const value = {
      path: latest.fullPath,
      conversationName: conversation.name || 'LM Studio 当前对话',
      model: conversation.lastUsedModel?.identifier || null,
      tokenCount: Number(conversation.tokenCount) || (Number.isFinite(totalTokens) ? totalTokens : null),
      promptTokens: Number.isFinite(promptTokens) ? promptTokens : null,
      predictedTokens: Number.isFinite(predictedTokens) ? predictedTokens : null,
      generationSpeed: Number.isFinite(generationSpeed) ? generationSpeed : null,
      promptSpeed: Number.isFinite(promptTokens) && Number.isFinite(ttft) && ttft > 0 ? promptTokens / ttft : null,
      active: userLast > assistantLast,
      lastUserText: latestUserText,
      updatedAt: Math.max(userLast, assistantLast, latest.mtimeMs),
    };
    conversationCache = { path: latest.fullPath, mtimeMs: latest.mtimeMs, value };
    return value;
  } catch (_) { return null; }
}

// LM Studio's OpenAI-compatible requests (including LAN clients) are recorded
// in server-logs even when they do not create a local conversation file.
function readLmStudioLogStats() {
  try {
    const root = path.join(process.env.USERPROFILE || os.homedir(), '.lmstudio', 'server-logs');
    if (!fs.existsSync(root)) return null;
    const files = [];
    for (const month of fs.readdirSync(root, { withFileTypes: true })) {
      if (!month.isDirectory()) continue;
      for (const entry of fs.readdirSync(path.join(root, month.name), { withFileTypes: true })) {
        if (entry.isFile() && entry.name.endsWith('.log')) {
          const fullPath = path.join(root, month.name, entry.name);
          const stat = fs.statSync(fullPath);
          files.push({ fullPath, size: stat.size, mtimeMs: stat.mtimeMs });
        }
      }
    }
    const latest = files.sort((a, b) => b.mtimeMs - a.mtimeMs)[0];
    if (!latest) return null;
    if (lmStudioLogCache && lmStudioLogCache.path === latest.fullPath && lmStudioLogCache.size === latest.size && lmStudioLogCache.mtimeMs === latest.mtimeMs) return lmStudioLogCache.value;
    const bytes = Math.min(latest.size, 384 * 1024);
    const fd = fs.openSync(latest.fullPath, 'r');
    const buffer = Buffer.alloc(bytes);
    fs.readSync(fd, buffer, 0, bytes, Math.max(0, latest.size - bytes));
    fs.closeSync(fd);
    const text = buffer.toString('utf8');
    const lines = text.split(/\r?\n/);
    const parseTime = (line) => {
      const match = line.match(/^\[([^\]]+)\]/);
      const value = match ? Date.parse(match[1].replace(' ', 'T')) : NaN;
      return Number.isFinite(value) ? value : 0;
    };
    const stats = { promptTokens: null, predictedTokens: null, promptSpeed: null, generationSpeed: null, taskId: null, updatedAt: 0, activeAt: 0 };
    for (const line of lines) {
      if (!line.includes('slot print_timing:')) continue;
      const at = parseTime(line);
      const task = line.match(/\|\s*task\s+(\d+)/);
      if (task) stats.taskId = task[1];
      let match = line.match(/prompt eval time\s*=\s*([\d.]+)\s*ms\s*\/\s*(\d+)\s*tokens\s*\([^,]+,\s*([\d.]+)\s*tokens per second/);
      if (match) {
        stats.promptTokens = Number(match[2]);
        stats.promptSpeed = Number(match[3]);
        stats.updatedAt = Math.max(stats.updatedAt, at);
        continue;
      }
      match = line.match(/\beval time\s*=\s*([\d.]+)\s*ms\s*\/\s*(\d+)\s*tokens\s*\([^,]+,\s*([\d.]+)\s*tokens per second/);
      if (match) {
        stats.predictedTokens = Number(match[2]);
        stats.generationSpeed = Number(match[3]);
        stats.updatedAt = Math.max(stats.updatedAt, at);
        continue;
      }
      match = line.match(/n_gen\s*=\s*(\d+),\s*tg\s*=\s*([\d.]+)\s*t\/s/);
      if (match) {
        stats.predictedTokens = Number(match[1]);
        stats.generationSpeed = Number(match[2]);
        stats.activeAt = Math.max(stats.activeAt, at);
        stats.updatedAt = Math.max(stats.updatedAt, at);
        continue;
      }
      match = line.match(/prompt processing,\s*n_tokens\s*=\s*(\d+).*?\/\s*([\d.]+)\s*tokens per second/);
      if (match) {
        stats.promptTokens = Number(match[1]);
        stats.promptSpeed = Number(match[2]);
        stats.activeAt = Math.max(stats.activeAt, at);
        stats.updatedAt = Math.max(stats.updatedAt, at);
      }
    }
    if (!stats.updatedAt) return null;
    const active = stats.activeAt > 0 && Date.now() - stats.activeAt < 10000;
    const value = {
      promptTokens: Number.isFinite(stats.promptTokens) ? stats.promptTokens : null,
      predictedTokens: Number.isFinite(stats.predictedTokens) ? stats.predictedTokens : null,
      generationSpeed: Number.isFinite(stats.generationSpeed) ? stats.generationSpeed : null,
      promptSpeed: Number.isFinite(stats.promptSpeed) ? stats.promptSpeed : null,
      tokenCount: Number.isFinite(stats.promptTokens) && Number.isFinite(stats.predictedTokens) ? stats.promptTokens + stats.predictedTokens : null,
      active,
      taskId: stats.taskId,
      lastUserText: '',
      conversationName: active ? '局域网客户端推理请求' : 'LM Studio 最近一次推理',
      updatedAt: stats.updatedAt,
    };
    lmStudioLogCache = { path: latest.fullPath, size: latest.size, mtimeMs: latest.mtimeMs, value };
    return value;
  } catch (_) { return null; }
}

// Sum completed LM Studio requests for the local calendar day. The server log
// emits repeated n_gen snapshots while a request is active, followed by one
// final eval-time line; only that final line is counted here.
function readLmStudioDailyStats() {
  try {
    const root = path.join(process.env.USERPROFILE || os.homedir(), '.lmstudio', 'server-logs');
    const now = new Date();
    const dateKey = [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
    const monthKey = dateKey.slice(0, 7);
    const monthDir = path.join(root, monthKey);
    if (!fs.existsSync(monthDir)) return { date: dateKey, generatedTokens: 0, promptTokens: 0, totalTokens: 0, requests: 0, source: 'LM Studio server logs' };
    const files = fs.readdirSync(monthDir, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.startsWith(dateKey) && entry.name.endsWith('.log')).map((entry) => {
      const fullPath = path.join(monthDir, entry.name);
      const stat = fs.statSync(fullPath);
      return { fullPath, size: stat.size, mtimeMs: stat.mtimeMs };
    }).sort((a, b) => a.fullPath.localeCompare(b.fullPath));
    const signature = `${dateKey}|${files.map((file) => `${file.fullPath}:${file.size}:${file.mtimeMs}`).join('|')}`;
    if (lmStudioDailyCache && lmStudioDailyCache.signature === signature) return lmStudioDailyCache.value;
    const parsedFiles = lmStudioDailyCache?.date === dateKey ? new Map(lmStudioDailyCache.files) : new Map();
    for (const file of files) {
      const previous = parsedFiles.get(file.fullPath);
      const fileSignature = `${file.size}:${file.mtimeMs}`;
      if (previous?.signature === fileSignature) continue;
      const fileTasks = new Map();
      const text = fs.readFileSync(file.fullPath, 'utf8');
      for (const line of text.split(/\r?\n/)) {
        const task = line.match(/\|\s*task\s+(\d+)/);
        if (!task) continue;
        const taskId = task[1];
        const entry = fileTasks.get(taskId) || { promptTokens: null, predictedTokens: null, completed: false };
        let match = line.match(/prompt eval time\s*=\s*[\d.]+\s*ms\s*\/\s*(\d+)\s*tokens\s*\(/);
        if (match) entry.promptTokens = Number(match[1]);
        match = line.match(/\beval time\s*=\s*[\d.]+\s*ms\s*\/\s*(\d+)\s*tokens\s*\(/);
        if (match) { entry.predictedTokens = Number(match[1]); entry.completed = true; }
        fileTasks.set(taskId, entry);
      }
      parsedFiles.set(file.fullPath, { signature: fileSignature, tasks: fileTasks });
    }
    for (const filePath of [...parsedFiles.keys()]) if (!files.some((file) => file.fullPath === filePath)) parsedFiles.delete(filePath);
    const tasks = new Map();
    for (const file of parsedFiles.values()) for (const [taskId, entry] of file.tasks) tasks.set(taskId, { ...(tasks.get(taskId) || {}), ...entry });
    let promptTokens = 0;
    let generatedTokens = 0;
    let requests = 0;
    for (const entry of tasks.values()) {
      if (!entry.completed || !Number.isFinite(entry.predictedTokens)) continue;
      requests += 1;
      generatedTokens += entry.predictedTokens;
      if (Number.isFinite(entry.promptTokens)) promptTokens += entry.promptTokens;
    }
    const value = { date: dateKey, generatedTokens, promptTokens, totalTokens: generatedTokens + promptTokens, requests, source: 'LM Studio server logs' };
    lmStudioDailyCache = { date: dateKey, signature, files: parsedFiles, value };
    return value;
  } catch (_) {
    return { date: new Date().toISOString().slice(0, 10), generatedTokens: 0, promptTokens: 0, totalTokens: 0, requests: 0, source: 'LM Studio server logs' };
  }
}

async function readNvidia() {
  const query = ['--query-gpu=index,name,memory.used,memory.total,utilization.gpu,temperature.gpu,power.draw,power.limit,clocks.current.graphics,fan.speed,pstate', '--format=csv,noheader,nounits'];
  const output = await exec('nvidia-smi', query);
  if (output) {
    const gpus = output.split(/\r?\n/).filter(Boolean).map((line) => {
      const p = line.split(',').map((v) => v.trim());
      const number = (value) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };
      return { id: Number(p[0]), name: p[1], memory: number(p[2]) || 0, memoryTotal: number(p[3]) || 0, util: number(p[4]) || 0, temp: number(p[5]), power: number(p[6]), powerLimit: number(p[7]), clock: number(p[8]), fan: number(p[9]) || 0, pstate: p[10] || '—', proc: 'nvidia-smi · 本机 GPU' };
    });
    if (gpus.length) return gpus;
  }
  return readAmdRocm();
}

async function readAmdRocm() {
  // AMD GPU via rocm-smi (ROCm 5.x+); returns [] if unavailable
  const os = require('os').platform();
  const isWin = os === 'win32';
  const cmd = isWin ? 'cmd' : '/bin/sh';
  const args = isWin ? ['/c', 'rocm-smi', '--showproductname', '--showuse', '--showmeminfo', 'vram', '--showtemp', '--showpower'] : ['-c', 'rocm-smi --showproductname --showuse --showmeminfo vram --showtemp --showpower 2>/dev/null'];
  const output = await exec(cmd, args, 3000);
  if (!output) return null;

  const gpus = [];
  // rocm-smi output is tabular; try to parse GPU rows
  const lines = output.split(/\r?\n/);
  let current = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    // Detect a new GPU block (e.g. "GPU 0:" or a line starting with a GPU index)
    const gpuMatch = line.match(/^GPU\s*(\d+):?/);
    if (gpuMatch) {
      if (current) gpus.push(current);
      current = { id: Number(gpuMatch[1]), name: 'AMD GPU', memory: 0, memoryTotal: 0, util: 0, temp: null, power: null, powerLimit: null, clock: null, fan: null, pstate: '—', proc: 'rocm-smi · 本机 GPU' };
      continue;
    }
    if (!current) continue;
    const nameMatch = line.match(/(?:GPU Name|Product Name|Device Name)[^:]*:\s*(.+)/i);
    if (nameMatch) { current.name = nameMatch[1].trim(); continue; }
    const useMatch = line.match(/(?:GPU use|GPU utilization|Use)[^:]*:\s*([\d.]+)/i);
    if (useMatch) { current.util = Number(useMatch[1]); continue; }
    const memMatch = line.match(/(?:VRAM|Memory|Total Memory)[^:]*:\s*([\d.]+)\s*(MB|GB)/i);
    if (memMatch) {
      const val = Number(memMatch[1]);
      const unit = memMatch[2].toUpperCase();
      if (unit === 'GB') { current.memoryTotal = Math.round(val * 1024); }
      else { current.memoryTotal = val; }
      continue;
    }
    const usedMatch = line.match(/(?:Used|Allocated)[^:]*:\s*([\d.]+)\s*(MB|GB)/i);
    if (usedMatch) {
      const val = Number(usedMatch[1]);
      const unit = usedMatch[2].toUpperCase();
      current.memory = unit === 'GB' ? Math.round(val * 1024) : val;
      continue;
    }
    const tempMatch = line.match(/(?:Temperature|Temp)[^:]*:\s*([\d.]+)/i);
    if (tempMatch) { current.temp = Number(tempMatch[1]); continue; }
    const powerMatch = line.match(/(?:Power|GPU Power)[^:]*:\s*([\d.]+)/i);
    if (powerMatch) { current.power = Number(powerMatch[1]); continue; }
  }
  if (current) gpus.push(current);
  return gpus.length ? gpus : null;
}

function parseTypeperf(output) {
  const rows = output.split(/\r?\n/).filter((line) => /^"[^\"]*"/.test(line));
  const row = rows.findLast((line) => /"[0-9]{1,2}\/|"[0-9]{4}-/.test(line));
  if (!row) return [];
  return [...row.matchAll(/"([^"]*)"/g)].slice(1).map((match) => Number(match[1].replace(',', '.')));
}

async function readTypeperf() {
  const counters = ['\\Processor(_Total)\\% Processor Time', '\\PhysicalDisk(_Total)\\% Disk Time', '\\PhysicalDisk(_Total)\\Disk Read Bytes/sec', '\\PhysicalDisk(_Total)\\Disk Write Bytes/sec'];
  const output = await exec('typeperf', [...counters, '-sc', '1'], 5000);
  const values = parseTypeperf(output);
  return { cpuPercent: Number.isFinite(values[0]) ? values[0] : null, diskActive: Number.isFinite(values[1]) ? values[1] : null, diskRead: Number.isFinite(values[2]) ? values[2] : null, diskWrite: Number.isFinite(values[3]) ? values[3] : null };
}

let previousUnixCpu = null;
let previousUnixDisk = null;

function readUnixPerformance() {
  const cpus = os.cpus();
  const totals = cpus.reduce((acc, cpu) => {
    for (const [key, value] of Object.entries(cpu.times)) acc[key] = (acc[key] || 0) + value;
    return acc;
  }, {});
  const total = Object.values(totals).reduce((sum, value) => sum + value, 0);
  const idle = (totals.idle || 0) + (totals.iowait || 0);
  const now = Date.now();
  let cpuPercent = null;
  if (previousUnixCpu) {
    const totalDelta = total - previousUnixCpu.total;
    const idleDelta = idle - previousUnixCpu.idle;
    if (totalDelta > 0) cpuPercent = Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
  }
  previousUnixCpu = { total, idle, at: now };

  let disk = { activePercent: null, readBytesPerSec: null, writeBytesPerSec: null };
  try {
    let sectorsRead = 0, sectorsWritten = 0, ioMillis = 0;
    for (const line of fs.readFileSync('/proc/diskstats', 'utf8').split('\n')) {
      const fields = line.trim().split(/\s+/);
      if (fields.length < 14) continue;
      const name = fields[2];
      if (!/^(nvme\d+n\d+|sd[a-z]+|vd[a-z]+|xvd[a-z]+)$/.test(name)) continue;
      sectorsRead += Number(fields[5]) || 0;
      sectorsWritten += Number(fields[9]) || 0;
      ioMillis += Number(fields[12]) || 0;
    }
    if (previousUnixDisk) {
      const elapsed = Math.max(0.1, (now - previousUnixDisk.at) / 1000);
      disk = {
        activePercent: Math.max(0, Math.min(100, ((ioMillis - previousUnixDisk.ioMillis) / (elapsed * 1000)) * 100)),
        readBytesPerSec: Math.max(0, (sectorsRead - previousUnixDisk.sectorsRead) * 512 / elapsed),
        writeBytesPerSec: Math.max(0, (sectorsWritten - previousUnixDisk.sectorsWritten) * 512 / elapsed),
      };
    }
    previousUnixDisk = { sectorsRead, sectorsWritten, ioMillis, at: now };
  } catch (_) {}
  return { cpuPercent, diskActive: disk.activePercent, diskRead: disk.readBytesPerSec, diskWrite: disk.writeBytesPerSec };
}

async function readProcessUnix() {
  const pattern = /strata|maya|llama|lm[-_ ]?studio|lmstudio|ollama|vllm|sglang|comfy|koboldcpp|text-generation/i;
  const output = await exec('ps', ['-eo', 'pid=,pcpu=,rss=,comm=,args='], 2500);
  if (!output) return null;
  let best = null;
  for (const line of output.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!match) continue;
    const [, pid, cpuPercent, rssKb, comm, args] = match;
    if (!pattern.test(comm) && !pattern.test(args)) continue;
    const memoryBytes = Number(rssKb) * 1024;
    if (!Number.isFinite(memoryBytes) || memoryBytes <= 0) continue;
    if (!best || memoryBytes > best.memoryBytes) {
      best = {
        name: String(comm).replace(/\.exe$/, ''),
        exe: String(comm),
        pid: Number(pid),
        memoryBytes,
        cpuPercent: Number.isFinite(Number(cpuPercent)) ? Number(cpuPercent) : null,
        command: String(args).trim().slice(0, 140),
      };
    }
  }
  return best ? { ...best, status: 'active' } : null;
}

async function readProcess() {
  if (process.platform !== 'win32') return readProcessUnix();
  const script = '$p=Get-Process | Where-Object { $_.ProcessName -match "llama|lmstudio|lm-studio|ollama" } | ForEach-Object { $cpu=0; try { if ($null -ne $_.CPU) { $cpu=[double]$_.CPU } } catch {}; [pscustomobject]@{name=$_.ProcessName; pid=$_.Id; memoryBytes=[int64]$_.WorkingSet64; cpuSeconds=$cpu} } | Sort-Object cpuSeconds -Descending | Select-Object -First 1; if ($null -eq $p) { "{}" } else { $p | ConvertTo-Json -Compress }';
  const output = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], 1800);
  if (!output) return null;
  try {
    const process = JSON.parse(output);
    if (!process?.pid) return null;
    const now = Date.now();
    const previous = previousProcess.get(process.pid);
    const elapsed = previous ? Math.max(.1, (now - previous.at) / 1000) : 0;
    const logicalProcessors = Math.max(1, require('os').cpus().length);
    const cpuPercent = previous && Number.isFinite(process.cpuSeconds) && process.cpuSeconds >= previous.cpuSeconds
      ? (process.cpuSeconds - previous.cpuSeconds) / elapsed / logicalProcessors * 100 : null;
    previousProcess.set(process.pid, { at: now, cpuSeconds: process.cpuSeconds });
    return { name: process.name, pid: Number(process.pid), memoryBytes: Number(process.memoryBytes) || 0, cpuPercent: Number.isFinite(cpuPercent) ? cpuPercent : null, status: 'active' };
  } catch (_) { return null; }
}

function readLinuxCpuTemperature() {
  try {
    const base = '/sys/class/thermal';
    const readings = fs.readdirSync(base)
      .filter((name) => name.startsWith('thermal_zone'))
      .map((name) => {
        try {
          const type = fs.readFileSync(path.join(base, name, 'type'), 'utf8').trim();
          const raw = Number(fs.readFileSync(path.join(base, name, 'temp'), 'utf8').trim());
          return { type, value: Number.isFinite(raw) ? raw / 1000 : null };
        } catch (_) { return null; }
      })
      .filter((item) => item && Number.isFinite(item.value) && item.value > 0);
    if (!readings.length) return null;
    const preferred = readings.filter((item) => /x86_pkg_temp|coretemp|cpu|package/i.test(item.type));
    const best = (preferred.length ? preferred : readings).sort((a, b) => b.value - a.value)[0];
    return best ? { value: Math.round(best.value * 10) / 10, source: best.type || 'Linux thermal zone' } : null;
  } catch (_) { return null; }
}

// Windows 没有统一的 CPU 温度接口。优先读 LibreHardwareMonitor / OpenHardwareMonitor 的 WMI 传感器；
// 没装监控软件时再退回 ACPI 热区。两者都读不到就返回 null，界面会明确显示“不可用”。
async function readCpuTemperature() {
  if (process.platform !== 'win32') return readLinuxCpuTemperature();
  if (cpuTemperatureCache && Date.now() - cpuTemperatureCache.at < 5000) return cpuTemperatureCache.value;
  if (cpuTemperatureInFlight) return cpuTemperatureInFlight;
  const script = String.raw`
$ErrorActionPreference = 'SilentlyContinue'
$value = $null
$source = $null
foreach ($ns in @('root/LibreHardwareMonitor', 'root/OpenHardwareMonitor')) {
  if ($null -ne $value) { break }
  try {
    $sensor = Get-CimInstance -Namespace $ns -ClassName Sensor -ErrorAction Stop |
      Where-Object { $_.SensorType -eq 'Temperature' -and $_.Value -gt 0 -and $_.Name -match '(CPU|Package|Core|Tctl|Tdie|CCD)' } |
      Sort-Object Value -Descending | Select-Object -First 1
    if ($sensor) {
      $value = [double]$sensor.Value
      $source = if ($ns -match 'Libre') { 'LibreHardwareMonitor' } else { 'OpenHardwareMonitor' }
    }
  } catch {}
}
if ($null -eq $value) {
  try {
    $sample = Get-Counter '\Thermal Zone Information(*)\Temperature' -SampleInterval 1 -MaxSamples 1 -ErrorAction Stop |
      Select-Object -ExpandProperty CounterSamples |
      Where-Object { $_.CookedValue -gt 20 } |
      Sort-Object CookedValue -Descending | Select-Object -First 1
    if ($sample) {
      $raw = [double]$sample.CookedValue
      if ($raw -gt 1000) { $value = ($raw / 10) - 273.15 }
      elseif ($raw -gt 200) { $value = $raw - 273.15 }
      else { $value = $raw }
      $source = 'ACPI thermal zone'
    }
  } catch {}
}
if ($null -ne $value -and $value -gt 0) {
  [pscustomobject]@{ value = [math]::Round($value, 1); source = $source } | ConvertTo-Json -Compress
}
`;
  cpuTemperatureInFlight = (async () => {
    const output = await exec('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], 2600);
    let value = null;
    try {
      const parsed = JSON.parse(output);
      if (Number.isFinite(Number(parsed?.value)) && Number(parsed.value) > 0) value = { value: Number(parsed.value), source: parsed.source || 'ACPI thermal zone' };
    } catch (_) {}
    cpuTemperatureCache = { at: Date.now(), value };
    return value;
  })().finally(() => { cpuTemperatureInFlight = null; });
  return cpuTemperatureInFlight;
}

async function readHost() {
  if (hostInFlight) return hostInFlight;
  if (hostCache && Date.now() - hostCache.timestamp < 900) return hostCache;
  hostInFlight = (async () => {
    const [perf, hostProcess, cpuTemperature] = await Promise.all([
      process.platform === 'win32' ? readTypeperf() : Promise.resolve(readUnixPerformance()),
      readProcess(),
      readCpuTemperature(),
    ]);
    const total = os.totalmem();
    const free = os.freemem();
    hostCache = {
      timestamp: Date.now(),
      cpuPercent: perf.cpuPercent,
      cpuModel: os.cpus()[0]?.model || null,
      cpuSpeedMHz: Number(os.cpus()[0]?.speed) || null,
      cpuTemperature,
      logicalProcessors: os.cpus().length,
      memory: { used: total - free, total },
      disk: { activePercent: perf.diskActive, readBytesPerSec: perf.diskRead, writeBytesPerSec: perf.diskWrite },
      process: hostProcess,
      source: process.platform === 'win32' ? 'typeperf' : 'procfs',
    };
    return hostCache;
  })().finally(() => { hostInFlight = null; });
  return hostInFlight;
}

async function probeInference(preferred = 'auto') {
  const settings = backendSettings;
  const llamaUrl = settings.llamaUrl;
  const vllmUrl = settings.vllmUrl;
  const targets = [
    { name: 'llama.cpp', url: llamaUrl, type: 'llama', key: 'llama' },
    { name: 'LM Studio', url: settings.lmStudioUrl, type: 'lmstudio', key: 'lmstudio' },
  ];
  // Strata 默认也监听 8080（和 llama.cpp 相同），所以只有显式给了 STRATA_URL 才单独探测它；
  // 否则 8080 上的后端由自检接口 /v1/status 的 service 字段区分（见 probeTarget）。
  const strataUrl = settings.strataUrl;
  if (strataUrl && strataUrl !== llamaUrl) targets.unshift({ name: 'Strata', url: strataUrl, type: 'strata', key: 'strata' });
  const mayaUrl = settings.mayaUrl;
  if (mayaUrl && !targets.some((target) => target.url === mayaUrl)) {
    targets.unshift({ name: 'Maya', url: mayaUrl, type: 'maya', key: 'maya' });
  }
  // vLLM 使用标准 OpenAI /v1/models 与 Prometheus /metrics，不限定 1Cat 分支。
  if (vllmUrl && !targets.some((target) => target.url === vllmUrl)) {
    targets.unshift({ name: 'vLLM', url: vllmUrl, type: 'vllm', key: 'vllm' });
  }
  const wanted = preferred === 'strata' && !targets.some((target) => target.key === 'strata') ? 'llama' : preferred;
  const ordered = wanted && wanted !== 'auto' ? [...targets.filter((target) => target.key === wanted), ...targets.filter((target) => target.key !== wanted)] : targets;
  const results = (await Promise.all(ordered.map((target) => probeTarget(target)))).filter(Boolean);
  const selected = results[0];
  const backends = results.map((result) => ({ key: result.key, name: result.backend, loaded: Boolean(result.loaded), model: result.model || null }));
  return selected ? { ...selected, backends } : { connected: false, loaded: false, backend: '未检测到推理后端', url: null, model: null, metrics: null, slots: null, details: null, key: null, backends };
}

async function probeTarget(target) {
  try {
    if (target.type === 'vllm') return await probeVllm(target);
    if (target.type === 'maya') return await probeMaya(target);
    if (target.type === 'lmstudio') {
      const now = Date.now();
      if (lmStudioProbeCache && now - lmStudioProbeCache.at < 1000) return { ...lmStudioProbeCache.value, key: target.key, backends: undefined };
      if (!lmStudioProbeInFlight) {
        lmStudioProbeInFlight = probeLmStudio(target).then((value) => {
          lmStudioProbeCache = { at: Date.now(), value };
          return value;
        }).finally(() => { lmStudioProbeInFlight = null; });
      }
      const lmStatus = await lmStudioProbeInFlight;
      if (lmStatus) return { ...lmStatus, key: target.key, backends: undefined };
    }
    if (target.type === 'strata') return await probeStrata(target);
    const response = await fetch(`${target.url}/v1/models`, { signal: AbortSignal.timeout(700) });
    if (!response.ok) return null;
    const data = await response.json();
    const models = Array.isArray(data.data) ? data.data.filter((item) => item && item.id) : [];
    const model = models[0];
    const loaded = models.length > 0;
    // llama.cpp、Strata 与 Maya 都是 OpenAI 兼容、默认端口也一样，靠 /v1/status 才能分辨。
    const mayaStatus = await readMayaStatus(target.url);
    if (mayaStatus) return await probeMaya(target, mayaStatus, model?.id || null);
    const strataStatus = await readStrataStatus(target.url);
    if (strataStatus) return await probeStrata(target, strataStatus, model?.id || null);
    let metrics = null;
    let metricsCounters = null;
    let metricsStart = null;
    if (loaded) try {
      const metricsResponse = await fetch(`${target.url}/metrics`, { signal: AbortSignal.timeout(700) });
      if (metricsResponse.ok) {
        metrics = parseMetrics(await metricsResponse.text(), target.name);
        const counters = metrics?.counters;
        if (counters && (Number.isFinite(counters.promptTokens) || Number.isFinite(counters.generatedTokens))) metricsCounters = counters;
        // llama.cpp 的 /metrics 会用这个响应头说明它自己的启动时间。
        const startHeader = metricsResponse.headers.get('Process-Start-Time-Unix');
        if (startHeader) metricsStart = Number(startHeader);
      }
    } catch (_) {}
    let slots = null;
    let derived = null;
    if (loaded) {
      try {
        const slotsResponse = await fetch(`${target.url}/slots`, { signal: AbortSignal.timeout(700) });
        if (slotsResponse.ok) {
          const slotPayload = await slotsResponse.json();
          slots = parseSlots(slotPayload);
          if (target.type === 'llama') {
            derived = deriveLlamaMetrics(slotPayload, model?.id || null);
            metrics = {
              ...(metrics || {}),
              promptSpeed: Number.isFinite(derived.promptSpeed) ? derived.promptSpeed : (metrics?.promptSpeed ?? null),
              generationSpeed: Number.isFinite(derived.generationSpeed) ? derived.generationSpeed : (metrics?.generationSpeed ?? null),
            };
          }
        }
      } catch (_) {}
    }
    if (target.type === 'llama') {
      // 今日累计：优先用 /metrics 的累计计数；没开 --metrics 就退回 /slots 的 token 增量。
      if (metricsCounters) syncDailyCounters('llama', metricsCounters.promptTokens, metricsCounters.generatedTokens, null, metricsStart);
      else if (derived) addDailyTokens(derived.promptDelta, derived.generationDelta);
      noteBackendActivity('llama', Boolean(slots?.active || derived?.active));
    }
    return {
      connected: true,
      loaded,
      backend: target.name,
      url: target.url,
      model: model?.id || null,
      metrics,
      slots,
      details: null,
      key: target.key,
      daily: target.type === 'llama' ? dailyTokensPayload(metricsCounters ? 'llama.cpp /metrics 增量' : 'llama.cpp /slots 增量') : null,
    };
  } catch (_) { return null; }
}

// Strata 的自述接口：/v1/status 给出模型、上下文窗口、并发与上一次请求的计时（llama.cpp 命名）。
async function readStrataStatus(base) {
  try {
    const response = await fetch(`${base}/v1/status`, { headers: strataHeaders, signal: AbortSignal.timeout(700) });
    if (!response.ok) return null;
    const data = await response.json();
    return data && data.service === 'strata' ? data : null;
  } catch (_) { return null; }
}

// Maya 的自述接口：/v1/status 与 Strata 类似，但 service 为 "maya"。
async function readMayaStatus(base) {
  try {
    const response = await fetch(`${base}/v1/status`, { headers: strataHeaders, signal: AbortSignal.timeout(700) });
    if (!response.ok) return null;
    const data = await response.json();
    return data && data.service === 'maya' ? data : null;
  } catch (_) {
    return null;
  }
}

// Maya 的 /metrics 是 JSON：live 是本请求的实时进度，last_timings 保留最近一次完成结果。
async function probeMaya(target, known = null, modelId = null) {
  const status = known || await readMayaStatus(target.url);
  if (!status) return null;
  let payload = null;
  try {
    const response = await fetch(`${target.url}/metrics`, { headers: strataHeaders, signal: AbortSignal.timeout(900) });
    if (response.ok) payload = await response.json();
  } catch (_) {}

  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const live = payload?.live || null;
  const engine = payload?.engine || {};
  const totals = payload?.totals || null;
  const timings = status.last_timings || null;
  const state = typeof live?.state === 'string' ? live.state : null;
  const busy = state === 'generating' || state === 'reading' || state === 'prefill' || state === 'prefilling';

  // Maya 的 last_timings.prompt_n 只算本次新增读取的 token；缓存复用数在 cache_n。
  // 上下文占用要显示完整 prompt，所以空闲时两者相加。
  const promptTokens = busy
    ? number(live?.prompt_tokens)
    : (number(timings?.prompt_n) !== null && number(timings?.cache_n) !== null
      ? number(timings.prompt_n) + number(timings.cache_n)
      : number(timings?.prompt_n));
  const predictedTokens = busy ? number(live?.generated) : number(timings?.predicted_n);
  const generationSpeed = (state === 'generating' ? number(live?.tok_s) : null) ?? number(timings?.predicted_per_second);
  const promptSpeed = (busy ? number(live?.prefill_tok_s_mean) : null) ?? number(timings?.prompt_per_second);
  const used = promptTokens !== null && predictedTokens !== null ? promptTokens + predictedTokens : null;
  const total = number(status.cache_max_tokens) ?? number(engine.max_context) ?? null;

  if (totals) {
    const fullPrompt = number(totals.prompt_tokens);
    const reusedPrompt = number(totals.reused);
    // 今日输入量对齐本机实际计算：缓存复用不计入新增 prompt。
    const freshPrompt = fullPrompt !== null && reusedPrompt !== null
      ? Math.max(0, fullPrompt - reusedPrompt)
      : fullPrompt;
    syncDailyCounters(
      'maya',
      freshPrompt,
      number(totals.output_tokens),
      number(totals.requests),
      number(totals.since),
    );
  }
  const modelLabel = engine.model_label || status.model_label || null;
  const labelParts = typeof modelLabel === 'string' ? modelLabel.split(' · ') : [];
  const architecture = labelParts.length ? labelParts[0] : 'DeepSeek V4.1';
  const quantization = labelParts.length > 1 ? labelParts[labelParts.length - 1] : null;
  const version = status.version || engine.maya_version || null;
  const queued = number(live?.queued) ?? number(status.activity?.queue?.waiting) ?? 0;
  const promptRead = number(live?.prompt_read);
  const promptTotal = number(live?.prompt_total);
  const activity = state === 'reading' || state === 'prefill' || state === 'prefilling'
    ? { state: 'prefilling', label: '读取提示词', detail: promptRead != null && promptTotal != null ? `预填充 ${Math.round(promptRead).toLocaleString('en-US')} / ${Math.round(promptTotal).toLocaleString('en-US')} tokens` : (live?.phase || '正在处理提示词') }
    : state === 'generating'
      ? { state: 'generating', label: '生成中', detail: number(live?.generated) != null ? `已生成 ${Math.round(number(live.generated)).toLocaleString('en-US')} tokens` : '正在输出 token' }
      : state === 'unloaded'
        ? { state: 'unloaded', label: '模型未加载', detail: '等待模型载入' }
        : queued > 0
          ? { state: 'queued', label: '排队中', detail: `${queued} 个请求等待推理槽位` }
          : { state: 'waiting', label: '等待请求', detail: '推理槽位空闲' };

  return {
    connected: true,
    loaded: Boolean(status.model) && status.unloaded !== true,
    backend: 'Maya',
    url: target.url,
    model: status.model || modelId || engine.model || null,
    key: 'maya',
    metrics: { promptSpeed, generationSpeed, promptTokens, predictedTokens },
    slots: {
      active: busy,
      used,
      total,
      promptTokens,
      predictedTokens,
      task: busy ? `Maya · ${state === 'reading' ? '读取提示词' : '生成中'}` : null,
      parallel: number(status.concurrency?.serving),
      queued,
      activeRequests: number(live?.active),
      activity,
    },
    details: {
      displayName: modelLabel || status.model || engine.model || null,
      architecture,
      quantization,
      parameters: null,
      format: 'GGUF',
      backend: 'Maya',
      backendVersion: version ? `Maya ${version}` : 'Maya',
      contextLength: total,
      parallel: number(status.concurrency?.serving),
      expertSlots: number(engine.expert_slots),
      kvType: typeof engine.kv === 'string' ? engine.kv : null,
      vision: status.vision?.enabled === true,
    },
    daily: dailyTokensPayload('Maya 累计 · 新增 prompt（不含缓存复用）'),
  };
}

// Strata 后端：/metrics 是 JSON（不是 llama.cpp 的 Prometheus 文本），实时速度、累计总量和硬件都在里面。
async function probeStrata(target, known = null, modelId = null) {
  const status = known || await readStrataStatus(target.url);
  if (!status) return null;
  let payload = null;
  try {
    const response = await fetch(`${target.url}/metrics`, { headers: strataHeaders, signal: AbortSignal.timeout(900) });
    if (response.ok) payload = await response.json();
  } catch (_) {}
  const number = (value) => Number.isFinite(Number(value)) ? Number(value) : null;
  const live = payload?.live || null;
  const engine = payload?.engine || {};
  const totals = payload?.totals || null;
  const timings = status.last_timings || null;
  const state = typeof live?.state === 'string' ? live.state : null;
  const busy = state === 'generating' || state === 'reading' || state === 'prefill' || state === 'prefilling';
  // 空闲时用 /metrics 里最近一次完成的请求，让卡片保留“最近一次推理”的读数。
  const recent = Array.isArray(payload?.requests) && payload.requests.length ? payload.requests[0] : null;
  const promptTokens = busy ? number(live?.prompt_tokens) : number(recent?.prompt_tokens);
  const predictedTokens = busy ? number(live?.generated) : number(recent?.output_tokens);
  const generationSpeed = (state === 'generating' ? number(live?.tok_s) : null) ?? number(timings?.predicted_per_second);
  const promptSpeed = (busy ? number(live?.prefill_tok_s_mean) : null) ?? number(timings?.prompt_per_second);
  const used = promptTokens !== null && predictedTokens !== null ? promptTokens + predictedTokens : null;
  const total = number(engine.max_context) ?? number(status.cache_max_tokens) ?? null;
  if (totals) syncDailyCounters('strata', number(totals.prompt_tokens), number(totals.output_tokens), number(totals.requests), number(totals.since));
  const version = engine.version || status.engine || null;
  const queued = number(live?.queued) ?? number(status.activity?.queue?.waiting) ?? 0;
  const promptRead = number(live?.prompt_read);
  const promptTotal = number(live?.prompt_total);
  const activity = state === 'reading' || state === 'prefill' || state === 'prefilling'
    ? { state: 'prefilling', label: '读取提示词', detail: promptRead != null && promptTotal != null ? `预填充 ${Math.round(promptRead).toLocaleString('en-US')} / ${Math.round(promptTotal).toLocaleString('en-US')} tokens` : (live?.phase || '正在处理提示词') }
    : state === 'generating'
      ? { state: 'generating', label: '生成中', detail: number(live?.generated) != null ? `已生成 ${Math.round(number(live.generated)).toLocaleString('en-US')} tokens` : '正在输出 token' }
      : state === 'unloaded'
        ? { state: 'unloaded', label: '模型未加载', detail: '等待模型载入' }
        : queued > 0
          ? { state: 'queued', label: '排队中', detail: `${queued} 个请求等待推理槽位` }
          : { state: 'waiting', label: '等待请求', detail: '推理槽位空闲' };
  return {
    connected: true,
    loaded: Boolean(status.loaded) || Boolean(modelId),
    backend: 'Strata',
    url: target.url,
    model: status.model || modelId || engine.model || null,
    key: 'strata',
    metrics: { promptSpeed, generationSpeed, promptTokens, predictedTokens },
    slots: {
      active: busy,
      used,
      total,
      promptTokens,
      predictedTokens,
      task: busy ? `当前推理请求 · ${state === 'reading' ? '读取提示词' : '生成中'}` : null,
      parallel: number(status.concurrency?.serving),
      queued,
      activeRequests: number(live?.active),
      activity,
    },
    details: {
      displayName: status.model || engine.model || null,
      architecture: null,
      quantization: null,
      parameters: null,
      format: null,
      backend: 'Strata',
      backendVersion: version ? `Strata ${version}` : 'Strata',
      contextLength: total,
      parallel: number(status.concurrency?.serving) || number(engine.batch_slots),
      expertSlots: number(engine.expert_slots),
      kvType: typeof engine.kv === 'string' ? engine.kv : null,
      prefillBatch: number(engine.prefill),
      vision: status.vision?.enabled === true,
    },
    daily: dailyTokensPayload('Strata 累计计数'),
  };
}

// 通用 vLLM：/v1/models 提供模型与 max_model_len，/metrics 提供请求、
// token、KV 占用和延迟直方图。兼容标准 vLLM 及 1Cat 等衍生分支。
async function probeVllm(target) {
  try {
    const response = await fetch(`${target.url}/v1/models`, {
      headers: vllmHeaders,
      signal: AbortSignal.timeout(900),
    });
    if (!response.ok) return null;
    const data = await response.json();
    const models = Array.isArray(data.data) ? data.data.filter((item) => item && item.id) : [];
    const model = models[0] || null;
    let metricsText = '';
    try {
      const metricsResponse = await fetch(`${target.url}/metrics`, {
        headers: vllmHeaders,
        signal: AbortSignal.timeout(900),
      });
      if (metricsResponse.ok) metricsText = await metricsResponse.text();
    } catch (_) {}

    const stats = parseVllmMetrics(metricsText, target.url);
    if (stats.counters) {
      syncDailyCounters(
        'vllm',
        stats.counters.promptTokens,
        stats.counters.generatedTokens,
        stats.counters.requests,
      );
    }
    noteBackendActivity('vllm', stats.active);

    const contextLength = Number(model?.max_model_len) || null;
    const kvUsage = stats.kvUsage == null ? null : Math.max(0, Math.min(1, stats.kvUsage));
    const used = contextLength && kvUsage != null ? Math.round(contextLength * kvUsage) : null;
    const queued = Number.isFinite(stats.waiting) ? stats.waiting : 0;
    const running = Number.isFinite(stats.running) ? stats.running : 0;
    const phase = running > 0
      ? (stats.generationDelta > 0 ? 'generating' : stats.promptDelta > 0 ? 'prefilling' : 'generating')
      : queued > 0 ? 'queued' : 'waiting';
    const activity = phase === 'generating'
      ? { state: 'generating', label: '生成中', detail: `${running} 个请求正在输出 token` }
      : phase === 'prefilling'
        ? { state: 'prefilling', label: '读取提示词', detail: `${running} 个请求正在预填充` }
        : phase === 'queued'
          ? { state: 'queued', label: '排队中', detail: `${queued} 个请求等待推理槽位` }
          : { state: 'waiting', label: '等待请求', detail: '推理服务空闲' };
    const label = `${model?.id || ''} ${model?.root || ''}`;
    const quantization = label.match(/\b(?:IQ\d(?:_[A-Z0-9]+)?|Q\d(?:_[A-Z0-9]+)?|FP\d+|NVFP4|MXFP4|AWQ|GPTQ|INT\d+)\b/i)?.[0] || null;
    const format = /\.gguf(?:\b|$)/i.test(label) ? 'GGUF' : null;

    return {
      connected: true,
      loaded: Boolean(model),
      backend: target.name,
      url: target.url,
      model: model?.id || null,
      key: target.key,
      metrics: {
        promptSpeed: stats.promptSpeed,
        generationSpeed: stats.generationSpeed,
        promptTokens: stats.latestPromptTokens,
        predictedTokens: stats.latestGeneratedTokens,
      },
      slots: {
        active: stats.active,
        used,
        total: contextLength,
        promptTokens: stats.latestPromptTokens,
        predictedTokens: stats.latestGeneratedTokens,
        task: stats.active ? `vLLM · ${running} 运行 / ${queued} 排队` : null,
        parallel: running || null,
        queued,
        activeRequests: running,
        kvUsage,
        activity,
      },
      details: {
        displayName: model?.id || null,
        architecture: null,
        quantization,
        parameters: null,
        format,
        backend: 'vLLM',
        backendVersion: 'vLLM',
        contextLength,
        parallel: null,
        kvType: null,
      },
      daily: dailyTokensPayload('vLLM /metrics 增量'),
    };
  } catch (_) {
    return null;
  }
}

async function probeLmStudio(target) {
  try {
    const response = await fetch(`${target.url}/api/v1/models`, { signal: AbortSignal.timeout(900) });
    if (!response.ok) return null;
    const data = await response.json();
    const models = Array.isArray(data.models) ? data.models : [];
    const loadedModel = models.find((model) => Array.isArray(model.loaded_instances) && model.loaded_instances.length > 0);
    const daily = readLmStudioDailyStats();
    if (!loadedModel) return { connected: true, loaded: false, backend: target.name, url: target.url, model: null, metrics: null, slots: null, details: null, daily };
    const instance = loadedModel.loaded_instances[0] || {};
    const config = instance.config || {};
    const conversation = readConversationStats();
    const logStats = readLmStudioLogStats();
    const sameModelConversation = conversation && (!conversation.model || conversation.model === (instance.id || loadedModel.key));
    const localStats = sameModelConversation ? conversation : null;
    const liveStats = logStats && (!localStats || logStats.updatedAt >= localStats.updatedAt) ? logStats : localStats;
    return {
      connected: true,
      loaded: true,
      backend: target.name,
      url: target.url,
      model: instance.id || loadedModel.key || loadedModel.display_name,
      metrics: liveStats ? { promptSpeed: liveStats.promptSpeed, generationSpeed: liveStats.generationSpeed, promptTokens: liveStats.promptTokens, predictedTokens: liveStats.predictedTokens } : null,
      slots: {
        active: Boolean(liveStats?.active),
        used: Number.isFinite(liveStats?.tokenCount) ? liveStats.tokenCount : null,
        total: Number(config.context_length || loadedModel.max_context_length) || null,
        promptTokens: liveStats?.promptTokens ?? null,
        predictedTokens: liveStats?.predictedTokens ?? null,
        task: liveStats?.active ? (liveStats.lastUserText || liveStats.conversationName || `当前推理请求 · task ${liveStats.taskId || '—'}`) : null,
        activity: liveStats?.active
          ? { state: 'generating', label: '生成中', detail: '正在输出 token' }
          : { state: 'waiting', label: '等待请求', detail: '推理槽位空闲' },
      },
      details: {
        displayName: loadedModel.display_name || loadedModel.key,
        architecture: loadedModel.architecture || null,
        quantization: loadedModel.quantization?.name || null,
        parameters: loadedModel.params_string || null,
        format: loadedModel.format || null,
        contextLength: Number(config.context_length || loadedModel.max_context_length) || null,
        evalBatchSize: Number(config.eval_batch_size) || null,
        physicalBatchSize: Number(config.physical_batch_size) || null,
        parallel: Number(config.parallel) || null,
        flashAttention: config.flash_attention === true,
        mtp: config.speculative_draft_mtp === true,
        gpuKvCache: config.offload_kv_cache_to_gpu === true,
        conversationName: liveStats?.conversationName || null,
        conversationUpdatedAt: liveStats?.updatedAt || null,
      },
      daily,
    };
  } catch (_) { return null; }
}

function parseSlots(payload) {
  const slots = Array.isArray(payload) ? payload : Array.isArray(payload?.slots) ? payload.slots : payload && typeof payload === 'object' ? [payload] : [];
  if (!slots.length) return null;
  const active = slots.find((slot) => slot.state === 1 || slot.state === 'processing' || slot.is_processing) || slots[0];
  const number = (...values) => values.find((value) => Number.isFinite(Number(value)));
  const decoded = number(active.next_token?.[0]?.n_decoded, active.n_decoded, active.n_tokens_predicted);
  const used = number(active.n_ctx_used, active.n_tokens, (Number.isFinite(Number(active.n_prompt_tokens)) && Number.isFinite(Number(decoded))) ? Number(active.n_prompt_tokens) + Number(decoded) : null, active.n_prompt_tokens_processed);
  const total = number(active.n_ctx, active.context_size, active.n_ctx_train);
  const promptTokens = number(active.n_prompt_tokens, active.n_prompt_tokens_processed, active.prompt_tokens);
  const predictedTokens = number(active.n_tokens_predicted, active.tokens_predicted, active.n_generated_tokens, decoded);
  const activeTask = active.state === 1 || active.state === 'processing' || active.is_processing;
  const processed = number(active.n_prompt_tokens_processed, active.prompt_tokens_processed);
  const phase = activeTask ? (Number(decoded) > 0 ? 'generating' : 'prefilling') : 'waiting';
  const label = phase === 'generating' ? '生成中' : phase === 'prefilling' ? '读取提示词' : '等待请求';
  const detail = phase === 'prefilling' && promptTokens != null && processed != null
    ? `预填充 ${Math.round(Number(processed)).toLocaleString('en-US')} / ${Math.round(Number(promptTokens)).toLocaleString('en-US')} tokens`
    : phase === 'generating' && decoded != null
      ? `已生成 ${Math.round(Number(decoded)).toLocaleString('en-US')} tokens`
      : activeTask ? '模型正在处理请求' : '推理槽位空闲';
  return {
    active: Boolean(activeTask),
    used: used == null ? null : Number(used),
    total: total == null ? null : Number(total),
    promptTokens: promptTokens == null ? null : Number(promptTokens),
    predictedTokens: predictedTokens == null ? null : Number(predictedTokens),
    decodedTokens: decoded == null ? null : Number(decoded),
    task: activeTask ? `当前推理请求 · task ${active.id_task ?? '—'}` : null,
    activity: { state: phase, label, detail },
  };
}

function deriveLlamaMetrics(payload, modelId = null) {
  const slots = Array.isArray(payload) ? payload : Array.isArray(payload?.slots) ? payload.slots : [];
  const active = slots.find((slot) => slot.is_processing);
  if (!active) {
    const sameModel = !lastLlamaMetrics.model || !modelId || lastLlamaMetrics.model === modelId;
    const speeds = sameModel
      ? { promptSpeed: lastLlamaMetrics.promptSpeed, generationSpeed: lastLlamaMetrics.generationSpeed }
      : { promptSpeed: null, generationSpeed: null };
    return { ...speeds, promptDelta: null, generationDelta: null, active: false };
  }
  const decoded = Number(active.next_token?.[0]?.n_decoded ?? active.n_decoded ?? active.n_tokens_predicted);
  const promptProcessed = Number(active.n_prompt_tokens_processed);
  const taskId = active.id_task ?? null;
  const key = `${active.id ?? 0}:${taskId ?? ''}`;
  const now = Date.now();
  const previous = previousLlamaSlots.get(key);
  const pollSeconds = lastLlamaProbeAt ? (now - lastLlamaProbeAt) / 1000 : null;
  lastLlamaProbeAt = now;
  // 新任务开始时，清掉上一任务的数值；任务结束后再由本缓存保留本任务最后一次有效值。
  const counterReset = Boolean(previous && ((Number.isFinite(decoded) && Number.isFinite(previous.decoded) && decoded < previous.decoded) || (Number.isFinite(promptProcessed) && Number.isFinite(previous.promptProcessed) && promptProcessed < previous.promptProcessed)));
  const isNewTask = (lastLlamaMetrics.taskId !== null && lastLlamaMetrics.taskId !== taskId) || counterReset;
  let promptSpeed = isNewTask ? null : (previous?.lastPromptSpeed ?? lastLlamaMetrics.promptSpeed ?? null);
  let generationSpeed = isNewTask ? null : (previous?.lastGenerationSpeed ?? lastLlamaMetrics.generationSpeed ?? null);
  let promptDelta = null;
  let generationDelta = null;
  if (previous && now > previous.at) {
    const seconds = (now - previous.at) / 1000;
    const generationStep = Number.isFinite(decoded) && Number.isFinite(previous.decoded) && decoded >= previous.decoded ? decoded - previous.decoded : null;
    const promptStep = Number.isFinite(promptProcessed) && Number.isFinite(previous.promptProcessed) && promptProcessed >= previous.promptProcessed ? promptProcessed - previous.promptProcessed : null;
    if (Number.isFinite(generationStep) && generationStep > 0) { generationSpeed = generationStep / seconds; generationDelta = generationStep; }
    if (Number.isFinite(promptStep) && promptStep > 0) { promptSpeed = promptStep / seconds; promptDelta = promptStep; }
  } else if (Number.isFinite(pollSeconds) && pollSeconds > 0.05 && pollSeconds < 10) {
    if (Number.isFinite(decoded) && decoded > 0) generationSpeed = decoded / pollSeconds;
    if (Number.isFinite(promptProcessed) && promptProcessed > 0) promptSpeed = promptProcessed / pollSeconds;
  }
  // 今日累计的增量：计数器归零只可能是新任务，这时当前值就是这一段已产生的 token；
  // 任务第一次被采样（没有上一份快照）时同理。
  if (!previous || counterReset) {
    if (Number.isFinite(decoded) && decoded > 0) generationDelta = decoded;
    if (Number.isFinite(promptProcessed) && promptProcessed > 0) promptDelta = promptProcessed;
  }
  const validPromptSpeed = Number.isFinite(promptSpeed) && promptSpeed > 0 ? promptSpeed : null;
  const validGenerationSpeed = Number.isFinite(generationSpeed) && generationSpeed > 0 ? generationSpeed : null;
  previousLlamaSlots.set(key, { at: now, decoded, promptProcessed, lastPromptSpeed: validPromptSpeed, lastGenerationSpeed: validGenerationSpeed });
  if (validPromptSpeed !== null || validGenerationSpeed !== null || isNewTask) {
    lastLlamaMetrics = {
      promptSpeed: validPromptSpeed,
      generationSpeed: validGenerationSpeed,
      taskId,
      model: modelId || lastLlamaMetrics.model,
      at: now,
    };
    saveLlamaMetricsCache();
  }
  return { promptSpeed: validPromptSpeed, generationSpeed: validGenerationSpeed, promptDelta, generationDelta, active: true };
}

function metricValue(text, names) {
  for (const name of names) {
    const match = text.match(new RegExp(`(?:^|\\n)${name}(?:\\{[^\\n]*\\})?\\s+([0-9.eE+-]+)`));
    if (match) return Number(match[1]);
  }
  return null;
}

function prometheusValues(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}(?:\\{[^\\n]*\\})?\\s+([0-9.eE+-]+)\\s*$`, 'gm');
  const values = [];
  for (const match of text.matchAll(pattern)) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) values.push(value);
  }
  return values;
}

function metricSum(text, names) {
  for (const name of names) {
    const values = prometheusValues(text, name);
    if (values.length) return values.reduce((sum, value) => sum + value, 0);
  }
  return null;
}

function metricMax(text, names) {
  for (const name of names) {
    const values = prometheusValues(text, name);
    if (values.length) return Math.max(...values);
  }
  return null;
}

function parseVllmMetrics(text, key) {
  const at = Date.now();
  const promptTokens = metricSum(text, ['vllm:prompt_tokens_total', 'vllm:prompt_tokens']);
  const generatedTokens = metricSum(text, ['vllm:generation_tokens_total', 'vllm:generation_tokens']);
  const requests = metricSum(text, ['vllm:request_success_total', 'vllm:request_success']);
  const running = metricMax(text, ['vllm:num_requests_running']);
  const waiting = metricMax(text, ['vllm:num_requests_waiting']);
  const kvUsage = metricMax(text, ['vllm:kv_cache_usage_perc']);
  const promptRequestSum = metricSum(text, ['vllm:request_prompt_tokens_sum']);
  const promptRequestCount = metricSum(text, ['vllm:request_prompt_tokens_count']);
  const generatedRequestSum = metricSum(text, ['vllm:request_generation_tokens_sum']);
  const generatedRequestCount = metricSum(text, ['vllm:request_generation_tokens_count']);
  const ttftSum = metricSum(text, ['vllm:time_to_first_token_seconds_sum']);
  const ttftCount = metricSum(text, ['vllm:time_to_first_token_seconds_count']);
  const outputTokenSecondsSum = metricSum(text, ['vllm:request_time_per_output_token_seconds_sum']);
  const outputTokenSecondsCount = metricSum(text, ['vllm:request_time_per_output_token_seconds_count']);
  const previous = previousVllmMetrics.get(key);
  previousVllmMetrics.set(key, { at, promptTokens, generatedTokens });
  const elapsed = previous && at > previous.at ? (at - previous.at) / 1000 : 0;
  const promptDelta = promptTokens != null && previous?.promptTokens != null ? promptTokens - previous.promptTokens : 0;
  const generationDelta = generatedTokens != null && previous?.generatedTokens != null ? generatedTokens - previous.generatedTokens : 0;
  const livePromptSpeed = elapsed > 0 && promptDelta >= 0 ? promptDelta / elapsed : null;
  const liveGenerationSpeed = elapsed > 0 && generationDelta >= 0 ? generationDelta / elapsed : null;
  const averagePromptTokens = promptRequestSum != null && promptRequestCount > 0 ? promptRequestSum / promptRequestCount : null;
  const averageGeneratedTokens = generatedRequestSum != null && generatedRequestCount > 0 ? generatedRequestSum / generatedRequestCount : null;
  const histogramPromptSpeed = averagePromptTokens != null && ttftSum != null && ttftCount > 0 && ttftSum > 0
    ? averagePromptTokens / (ttftSum / ttftCount)
    : null;
  const histogramGenerationSpeed = outputTokenSecondsSum != null && outputTokenSecondsCount > 0 && outputTokenSecondsSum > 0
    ? outputTokenSecondsCount / outputTokenSecondsSum
    : null;
  const active = Number(running) > 0 || Number(waiting) > 0;
  const previousSpeeds = lastVllmSpeeds.get(key) || { promptSpeed: null, generationSpeed: null };
  const promptSpeed = active
    ? (Number.isFinite(livePromptSpeed) && livePromptSpeed > 0 ? livePromptSpeed : histogramPromptSpeed ?? previousSpeeds.promptSpeed)
    : previousSpeeds.promptSpeed ?? histogramPromptSpeed;
  const generationSpeed = active
    ? (Number.isFinite(liveGenerationSpeed) && liveGenerationSpeed > 0 ? liveGenerationSpeed : histogramGenerationSpeed ?? previousSpeeds.generationSpeed)
    : previousSpeeds.generationSpeed ?? histogramGenerationSpeed;
  if (Number.isFinite(promptSpeed) || Number.isFinite(generationSpeed)) {
    lastVllmSpeeds.set(key, { promptSpeed, generationSpeed });
  }
  return {
    promptSpeed,
    generationSpeed,
    latestPromptTokens: averagePromptTokens,
    latestGeneratedTokens: averageGeneratedTokens,
    promptDelta,
    generationDelta,
    running,
    waiting,
    kvUsage,
    active,
    counters: promptTokens != null || generatedTokens != null || requests != null
      ? { promptTokens, generatedTokens, requests }
      : null,
  };
}

function parseMetrics(text, backend) {
  const snapshot = {
    promptTokens: metricValue(text, ['llamacpp:prompt_tokens_total', 'prompt_tokens_total']),
    promptSeconds: metricValue(text, ['llamacpp:prompt_seconds_total', 'prompt_seconds_total']),
    predictedTokens: metricValue(text, ['llamacpp:predicted_tokens_total', 'tokens_predicted_total', 'predicted_tokens_total']),
    predictedSeconds: metricValue(text, ['llamacpp:predicted_seconds_total', 'tokens_predicted_seconds_total', 'predicted_seconds_total']),
  };
  const key = `${backend}`;
  const previous = previousMetrics.get(key);
  previousMetrics.set(key, snapshot);
  const rate = (tokens, seconds, previousTokens, previousSeconds) => {
    if (![tokens, seconds, previousTokens, previousSeconds].every(Number.isFinite)) return null;
    const dt = seconds - previousSeconds;
    const dtk = tokens - previousTokens;
    return dt > 0 && dtk >= 0 ? dtk / dt : null;
  };
  return {
    promptSpeed: rate(snapshot.promptTokens, snapshot.promptSeconds, previous?.promptTokens, previous?.promptSeconds),
    generationSpeed: rate(snapshot.predictedTokens, snapshot.predictedSeconds, previous?.predictedTokens, previous?.predictedSeconds),
    // 累计计数本身也要带出去：今日累计靠它求差。
    counters: { promptTokens: snapshot.promptTokens, generatedTokens: snapshot.predictedTokens },
  };
}

async function status(preferredBackend = 'auto') {
  const [gpus, inference, host] = await Promise.all([readNvidia(), probeInference(preferredBackend), readHost()]);
  const powerValues = (gpus || []).map((gpu) => gpu.power).filter(Number.isFinite);
  return {
    source: gpus ? (gpus[0]?.proc?.startsWith('rocm-smi') ? 'rocm-smi' : 'nvidia-smi') : 'demo',
    gpus,
    power: { total: powerValues.length ? powerValues.reduce((sum, value) => sum + value, 0) : null, known: powerValues.length, gpuCount: gpus?.length || 0 },
    memory: host.memory,
    host,
    inference,
    timestamp: Date.now(),
  };
}

function readJsonBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    let settled = false;
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      if (settled) return;
      body += chunk;
      if (body.length > limit) {
        settled = true;
        reject(new Error('请求内容过大'));
      }
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      try {
        const parsed = body.trim() ? JSON.parse(body) : {};
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('请求内容必须是 JSON 对象');
        resolve(parsed);
      } catch (error) {
        reject(error instanceof SyntaxError ? new Error('请求内容不是有效的 JSON') : error);
      }
    });
    req.on('error', (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

function settingsPostAllowed(req) {
  const contentType = req.headers['content-type'] || '';
  if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return { code: 415, error: '请求必须使用 application/json' };
  }
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).host !== req.headers.host) return { code: 403, error: '不允许跨站修改设置' };
    } catch (_) {
      return { code: 403, error: '来源地址无效' };
    }
  }
  return null;
}

function backendSummary(target, payload) {
  const model = payload?.data?.[0]?.id
    || payload?.model?.id
    || payload?.model?.name
    || payload?.model_name
    || (typeof payload?.model === 'string' ? payload.model : null);
  const service = payload?.service || payload?.backend;
  return [service, model].filter(Boolean).join(' · ');
}

async function testBackendEndpoint(key, baseUrl) {
  const target = BACKEND_TEST_TARGETS[key];
  const endpoint = `${baseUrl}${target.path}`;
  try {
    const response = await fetch(endpoint, {
      headers: target.headers(),
      signal: AbortSignal.timeout(2500),
    });
    let payload = null;
    try {
      payload = await response.json();
    } catch (_) {}
    const summary = backendSummary(target, payload);
    return {
      key,
      name: target.name,
      url: baseUrl,
      endpoint,
      ok: response.ok,
      status: response.status,
      detail: response.ok ? (summary ? `连接成功 · ${summary}` : '连接成功') : `HTTP ${response.status}`,
    };
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    return {
      key,
      name: target.name,
      url: baseUrl,
      endpoint,
      ok: false,
      status: null,
      detail: timedOut ? '连接超时' : '无法连接',
    };
  }
}

async function testBackendSettings(settings) {
  const results = await Promise.all(
    BACKEND_SETTING_KEYS.map((key) => testBackendEndpoint(key, settings[key])),
  );
  return { results };
}

function send(res, code, type, body) { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); }
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/status') {
    try { send(res, 200, MIME['.json'], JSON.stringify(await status(url.searchParams.get('backend') || 'auto'))); } catch (error) { send(res, 500, MIME['.json'], JSON.stringify({ error: error.message })); }
    return;
  }
  if (url.pathname === '/api/settings') {
    if (!['GET', 'POST'].includes(req.method)) {
      res.setHeader('Allow', 'GET, POST');
      send(res, 405, MIME['.json'], JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    if (req.method === 'GET') {
      send(res, 200, MIME['.json'], JSON.stringify(backendSettingsPayload()));
      return;
    }
    const rejected = settingsPostAllowed(req);
    if (rejected) {
      send(res, rejected.code, MIME['.json'], JSON.stringify({ error: rejected.error }));
      return;
    }
    try {
      const body = await readJsonBody(req);
      const saved = saveBackendSettings({ ...backendSettings, ...body });
      send(res, 200, MIME['.json'], JSON.stringify({
        values: saved,
        defaults: { ...DEFAULT_BACKEND_SETTINGS },
      }));
    } catch (error) {
      send(res, 400, MIME['.json'], JSON.stringify({ error: error.message }));
    }
    return;
  }
  if (url.pathname === '/api/settings/test') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      send(res, 405, MIME['.json'], JSON.stringify({ error: 'Method not allowed' }));
      return;
    }
    const rejected = settingsPostAllowed(req);
    if (rejected) {
      send(res, rejected.code, MIME['.json'], JSON.stringify({ error: rejected.error }));
      return;
    }
    try {
      const body = await readJsonBody(req);
      const settings = normalizeBackendSettings({ ...backendSettings, ...body });
      send(res, 200, MIME['.json'], JSON.stringify(await testBackendSettings(settings)));
    } catch (error) {
      send(res, 400, MIME['.json'], JSON.stringify({ error: error.message }));
    }
    return;
  }
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.resolve(ROOT, `.${requested}`);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { send(res, 404, 'text/plain; charset=utf-8', 'Not found'); return; }
  send(res, 200, MIME[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file));
});
server.listen(PORT, HOST, () => console.log(`Local AI Workbench running at http://${HOST}:${PORT}`));
