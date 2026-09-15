const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

const PORT = Number(process.env.PORT || 4173);
const ROOT = __dirname;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml' };
const previousMetrics = new Map();
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
const previousProcess = new Map();
let conversationCache = null;
let lmStudioLogCache = null;
let lmStudioDailyCache = null;
let lmStudioProbeCache = null;
let lmStudioProbeInFlight = null;
let hostCache = null;
let hostInFlight = null;

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
  if (!output) return null;
  const gpus = output.split(/\r?\n/).filter(Boolean).map((line) => {
    const p = line.split(',').map((v) => v.trim());
    const number = (value) => { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : null; };
    return { id: Number(p[0]), name: p[1], memory: number(p[2]) || 0, memoryTotal: number(p[3]) || 0, util: number(p[4]) || 0, temp: number(p[5]), power: number(p[6]), powerLimit: number(p[7]), clock: number(p[8]), fan: number(p[9]) || 0, pstate: p[10] || '—', proc: 'nvidia-smi · 本机 GPU' };
  });
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

async function readProcess() {
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

async function readHost() {
  if (hostInFlight) return hostInFlight;
  if (hostCache && Date.now() - hostCache.timestamp < 900) return hostCache;
  hostInFlight = (async () => {
    const [perf, process] = await Promise.all([readTypeperf(), readProcess()]);
    const total = os.totalmem();
    const free = os.freemem();
    hostCache = {
      timestamp: Date.now(),
      cpuPercent: perf.cpuPercent,
      cpuModel: os.cpus()[0]?.model || null,
      cpuSpeedMHz: Number(os.cpus()[0]?.speed) || null,
      logicalProcessors: os.cpus().length,
      memory: { used: total - free, total },
      disk: { activePercent: perf.diskActive, readBytesPerSec: perf.diskRead, writeBytesPerSec: perf.diskWrite },
      process,
    };
    return hostCache;
  })().finally(() => { hostInFlight = null; });
  return hostInFlight;
}

async function probeInference(preferred = 'auto') {
  const targets = [
    { name: 'llama.cpp', url: process.env.LLAMA_URL || 'http://127.0.0.1:8080', type: 'llama', key: 'llama' },
    { name: 'LM Studio', url: process.env.LMSTUDIO_URL || 'http://127.0.0.1:1234', type: 'lmstudio', key: 'lmstudio' },
  ];
  const ordered = preferred && preferred !== 'auto' ? [...targets.filter((target) => target.key === preferred), ...targets.filter((target) => target.key !== preferred)] : targets;
  const results = (await Promise.all(ordered.map((target) => probeTarget(target)))).filter(Boolean);
  const selected = results[0];
  const backends = results.map((result) => ({ key: result.key, name: result.backend, loaded: Boolean(result.loaded), model: result.model || null }));
  return selected ? { ...selected, backends } : { connected: false, loaded: false, backend: '未检测到推理后端', url: null, model: null, metrics: null, slots: null, details: null, key: null, backends };
}

async function probeTarget(target) {
  try {
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
    const response = await fetch(`${target.url}/v1/models`, { signal: AbortSignal.timeout(700) });
    if (!response.ok) return null;
    const data = await response.json();
    const models = Array.isArray(data.data) ? data.data.filter((item) => item && item.id) : [];
    const model = models[0];
    const loaded = models.length > 0;
    let metrics = null;
    if (loaded) try {
      const metricsResponse = await fetch(`${target.url}/metrics`, { signal: AbortSignal.timeout(700) });
      if (metricsResponse.ok) metrics = parseMetrics(await metricsResponse.text(), target.name);
    } catch (_) {}
    let slots = null;
    if (loaded) {
      try {
        const slotsResponse = await fetch(`${target.url}/slots`, { signal: AbortSignal.timeout(700) });
        if (slotsResponse.ok) {
          const slotPayload = await slotsResponse.json();
          slots = parseSlots(slotPayload);
          if (target.type === 'llama') {
            const derived = deriveLlamaMetrics(slotPayload, model?.id || null);
            metrics = {
              ...(metrics || {}),
              promptSpeed: Number.isFinite(derived.promptSpeed) ? derived.promptSpeed : (metrics?.promptSpeed ?? null),
              generationSpeed: Number.isFinite(derived.generationSpeed) ? derived.generationSpeed : (metrics?.generationSpeed ?? null),
            };
          }
        }
      } catch (_) {}
    }
    return { connected: true, loaded, backend: target.name, url: target.url, model: model?.id || null, metrics, slots, details: null, key: target.key };
  } catch (_) { return null; }
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
      slots: { active: Boolean(liveStats?.active), used: Number.isFinite(liveStats?.tokenCount) ? liveStats.tokenCount : null, total: Number(config.context_length || loadedModel.max_context_length) || null, promptTokens: liveStats?.promptTokens ?? null, predictedTokens: liveStats?.predictedTokens ?? null, task: liveStats?.active ? (liveStats.lastUserText || liveStats.conversationName || `当前推理请求 · task ${liveStats.taskId || '—'}`) : null },
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
  return { active: Boolean(activeTask), used: used == null ? null : Number(used), total: total == null ? null : Number(total), promptTokens: promptTokens == null ? null : Number(promptTokens), predictedTokens: predictedTokens == null ? null : Number(predictedTokens), decodedTokens: decoded == null ? null : Number(decoded), task: activeTask ? `当前推理请求 · task ${active.id_task ?? '—'}` : null };
}

function deriveLlamaMetrics(payload, modelId = null) {
  const slots = Array.isArray(payload) ? payload : Array.isArray(payload?.slots) ? payload.slots : [];
  const active = slots.find((slot) => slot.is_processing);
  if (!active) {
    const sameModel = !lastLlamaMetrics.model || !modelId || lastLlamaMetrics.model === modelId;
    return sameModel
      ? { promptSpeed: lastLlamaMetrics.promptSpeed, generationSpeed: lastLlamaMetrics.generationSpeed }
      : { promptSpeed: null, generationSpeed: null };
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
  if (previous && now > previous.at) {
    const seconds = (now - previous.at) / 1000;
    const generationDelta = Number.isFinite(decoded) && Number.isFinite(previous.decoded) && decoded >= previous.decoded ? decoded - previous.decoded : null;
    const promptDelta = Number.isFinite(promptProcessed) && Number.isFinite(previous.promptProcessed) && promptProcessed >= previous.promptProcessed ? promptProcessed - previous.promptProcessed : null;
    if (Number.isFinite(generationDelta) && generationDelta > 0) generationSpeed = generationDelta / seconds;
    if (Number.isFinite(promptDelta) && promptDelta > 0) promptSpeed = promptDelta / seconds;
  } else if (Number.isFinite(pollSeconds) && pollSeconds > 0.05 && pollSeconds < 10) {
    if (Number.isFinite(decoded) && decoded > 0) generationSpeed = decoded / pollSeconds;
    if (Number.isFinite(promptProcessed) && promptProcessed > 0) promptSpeed = promptProcessed / pollSeconds;
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
  return { promptSpeed: validPromptSpeed, generationSpeed: validGenerationSpeed };
}

function metricValue(text, names) {
  for (const name of names) {
    const match = text.match(new RegExp(`(?:^|\\n)${name}(?:\\{[^\\n]*\\})?\\s+([0-9.eE+-]+)`));
    if (match) return Number(match[1]);
  }
  return null;
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
  };
}

async function status(preferredBackend = 'auto') {
  const [gpus, inference, host] = await Promise.all([readNvidia(), probeInference(preferredBackend), readHost()]);
  const powerValues = (gpus || []).map((gpu) => gpu.power).filter(Number.isFinite);
  return {
    source: gpus ? 'nvidia-smi' : 'demo',
    gpus,
    power: { total: powerValues.length ? powerValues.reduce((sum, value) => sum + value, 0) : null, known: powerValues.length, gpuCount: gpus?.length || 0 },
    memory: host.memory,
    host,
    inference,
    timestamp: Date.now(),
  };
}

function send(res, code, type, body) { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' }); res.end(body); }
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/api/status') {
    try { send(res, 200, MIME['.json'], JSON.stringify(await status(url.searchParams.get('backend') || 'auto'))); } catch (error) { send(res, 500, MIME['.json'], JSON.stringify({ error: error.message })); }
    return;
  }
  const requested = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.resolve(ROOT, `.${requested}`);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { send(res, 404, 'text/plain; charset=utf-8', 'Not found'); return; }
  send(res, 200, MIME[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file));
});
server.listen(PORT, '127.0.0.1', () => console.log(`Local AI Workbench running at http://127.0.0.1:${PORT}`));
