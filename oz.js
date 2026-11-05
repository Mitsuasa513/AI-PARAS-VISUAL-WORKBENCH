// NEXUS 一屏版共享数据层：只渲染 /api/status，不直接读取本机硬件。
const $ = (id) => document.getElementById(id);
const fmt = (value) => Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString('en-US') : '—';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

let backend = 'auto';
let intervalMs = 1200;
let timer = null;
const metricSeries = { key: '', gen: [], prompt: [] };
const MAX_METRIC_SAMPLES = 36;

function set(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

function firstFinite(...values) {
  return values.find((value) => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)));
}

function renderSpark(prefix, values) {
  const line = $(`${prefix}SparkLine`);
  const area = $(`${prefix}SparkArea`);
  const dot = $(`${prefix}SparkDot`);
  const svg = $(`${prefix}Spark`);
  if (!line || !area || !dot || !svg) return;
  if (!values.length) {
    line.setAttribute('d', '');
    area.setAttribute('d', '');
    dot.style.display = 'none';
    return;
  }
  const width = 160;
  const top = 3;
  const bottom = 29;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const spread = max - min;
  const low = spread > 0.001 ? Math.max(0, min - spread * 0.12) : Math.max(0, max * 0.86);
  const high = spread > 0.001 ? max + spread * 0.12 : Math.max(1, max * 1.14);
  const range = high - low || 1;
  const points = values.map((value, index) => ({
    x: values.length === 1 ? width - 1 : index / (values.length - 1) * width,
    y: bottom - (value - low) / range * (bottom - top),
  }));
  const linePath = points.map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(' ');
  const last = points[points.length - 1];
  line.setAttribute('d', points.length === 1 ? `${linePath} l0.01 0` : linePath);
  area.setAttribute('d', points.length > 1 ? `${linePath} L${last.x.toFixed(2)} ${bottom} L${points[0].x.toFixed(2)} ${bottom} Z` : '');
  dot.setAttribute('cx', last.x.toFixed(2));
  dot.setAttribute('cy', last.y.toFixed(2));
  dot.style.display = '';
  svg.setAttribute('aria-label', `最近 ${values.length} 次采样，最低 ${min.toFixed(1)}，最高 ${max.toFixed(1)} tok/s`);
}

function pushMetric(name, value) {
  if (!Number.isFinite(Number(value))) return;
  metricSeries[name].push(Number(value));
  if (metricSeries[name].length > MAX_METRIC_SAMPLES) metricSeries[name].shift();
  renderSpark(name, metricSeries[name]);
}

function fitProcessor() {
  const element = $('cpuModel');
  if (!element) return;
  element.style.fontSize = '';
  let size = Number.parseFloat(getComputedStyle(element).fontSize);
  while (element.scrollWidth > element.clientWidth && size > 12) {
    size -= 0.5;
    element.style.fontSize = `${size}px`;
  }
}

function fitPage() {
  const stage = $('pageStage');
  if (!stage) return;
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;
  const scale = Math.min(viewportWidth / 1920, viewportHeight / 1080, 1);
  const renderedWidth = 1920 * scale;
  const renderedHeight = 1080 * scale;
  stage.style.left = `${Math.max(0, (viewportWidth - renderedWidth) / 2)}px`;
  stage.style.top = `${Math.max(0, (viewportHeight - renderedHeight) / 2)}px`;
  stage.style.transform = `scale(${scale})`;
  stage.dataset.scale = scale.toFixed(3);
}

function cpu(host) {
  const percent = Number(host?.cpuPercent);
  const threads = Number(host?.logicalProcessors);
  const speed = Number(host?.cpuSpeedMHz);
  const temperature = host?.cpuTemperature || null;
  const tempValue = Number(temperature?.value ?? host?.cpuTemp);
  set('cpuModel', host?.cpuModel || '本机处理器');
  set('cpuSub', host?.cpuModel ? 'PROCESSOR TELEMETRY' : 'PROCESSOR MODEL UNAVAILABLE');
  set('cpuPct', Number.isFinite(percent) ? `${percent.toFixed(1)}%` : '—');
  set('cpuLoadBig', Number.isFinite(percent) ? `${percent.toFixed(1)}%` : '—');
  set('cpuClock', Number.isFinite(speed) ? Math.round(speed).toLocaleString('en-US') : '—');
  set('cpuTemp', Number.isFinite(tempValue) && tempValue > 0 ? `${tempValue.toFixed(1)}°C` : '—°C');
  set('cpuTempSource', Number.isFinite(tempValue) && tempValue > 0 ? (temperature?.source || '系统热区') : '系统未提供');
  set('cpuCores', threads ? Math.max(1, Math.round(threads / 2)) : '—');
  set('cpuThreads', threads || '—');
  $('cpuBar').style.width = `${clamp(percent || 0, 0, 100)}%`;
  fitProcessor();
}

function memory(memory) {
  const total = Number(memory?.total);
  const used = Number(memory?.used);
  const percent = total ? used / total * 100 : null;
  const totalGb = total ? total / 1073741824 : null;
  const usedGb = used ? used / 1073741824 : null;
  set('ramTitle', totalGb ? `${totalGb.toFixed(1)} GB` : '— GB');
  set('ramPct', Number.isFinite(percent) ? `${percent.toFixed(1)}%` : '—');
  set('ramUsed', usedGb ? `${usedGb.toFixed(1)} GB` : '—');
  set('ramAvailable', totalGb && usedGb ? `${(totalGb - usedGb).toFixed(1)} GB` : '—');
  $('ramBar').style.width = `${clamp(percent || 0, 0, 100)}%`;
}

function gpus(list) {
  const rows = Array.isArray(list) ? list : [];
  set('gpuCount', `${rows.length} / ${rows.length}`);
  $('gpuGrid').innerHTML = rows.length ? rows.map((gpu) => {
    const memoryPercent = gpu.memoryTotal ? gpu.memory / gpu.memoryTotal * 100 : 0;
    const powerLimit = Number.isFinite(gpu.powerLimit) ? Math.round(gpu.powerLimit) : '—';
    const vendor = /AMD|Radeon/i.test(gpu.name || '') ? 'AMD' : 'NVIDIA';
    return `<article class="gpu-card">
      <span class="gpu-tag">GPU${gpu.id} · ${vendor}</span>
      <h3 title="${gpu.name || vendor + ' GPU'}">${gpu.name || `${vendor} GPU`}</h3>
      <p>设备状态 · ${gpu.pstate || '—'} · 本机采样</p>
      <div class="gpu-stats">
        <div><span>利用率</span><strong class="blossom-text">${Number.isFinite(gpu.util) ? Math.round(gpu.util) : '—'}%</strong><div class="meter"><i style="width:${clamp(gpu.util || 0, 0, 100)}%"></i></div></div>
        <div><span>显存</span><strong title="${fmt(gpu.memory)} / ${fmt(gpu.memoryTotal)} MB">${fmt(gpu.memory)}<small> MB</small></strong><div class="meter"><i style="width:${clamp(memoryPercent, 0, 100)}%"></i></div></div>
        <div><span>温度</span><strong class="sun-text">${Number.isFinite(gpu.temp) ? Math.round(gpu.temp) : '—'}°C</strong></div>
        <div><span>功耗</span><strong title="${Number.isFinite(gpu.power) ? Math.round(gpu.power) : '—'} / ${powerLimit} W">${Number.isFinite(gpu.power) ? Math.round(gpu.power) : '—'}<small> W</small></strong></div>
      </div>
    </article>`;
  }).join('') : '<article class="gpu-card empty"><span class="gpu-tag">GPU ARRAY</span><h3>未检测到 GPU</h3><p>等待 nvidia-smi 或 rocm-smi 返回设备信息</p></article>';
}

function tokenUsage(inference) {
  const loaded = Boolean(inference?.connected && inference?.loaded && inference?.model);
  if (!loaded) {
    set('inputTokens', '【未加载模型】');
    set('outputTokens', '【未加载模型】');
    set('totalTokens', '【未加载模型】');
    set('tokenNote', '等待本机后端加载模型');
    return;
  }
  const slots = inference?.slots || {};
  const metrics = inference?.metrics || {};
  const first = (...values) => values.find((value) => Number.isFinite(Number(value)));
  const input = first(slots.promptTokens, metrics.promptTokens);
  const output = first(slots.predictedTokens, slots.decodedTokens, metrics.predictedTokens);
  const total = Number.isFinite(Number(input)) && Number.isFinite(Number(output)) ? Number(input) + Number(output) : null;
  set('inputTokens', Number.isFinite(Number(input)) ? fmt(input) : '—');
  set('outputTokens', Number.isFinite(Number(output)) ? fmt(output) : '—');
  set('totalTokens', Number.isFinite(Number(total)) ? fmt(total) : '—');
  set('tokenNote', Number.isFinite(Number(total)) ? (slots.active ? '当前推理实时统计' : '最近一次推理统计') : '等待后端返回 token 明细');
}

function activityFor(inference, slots) {
  if (!inference?.connected) return { state: 'offline', label: '后端未连接', detail: '等待本机推理服务上线' };
  if (!inference?.loaded || !inference?.model) return { state: 'unloaded', label: '模型未加载', detail: '等待本机后端加载模型' };
  if (slots?.activity?.label) return slots.activity;
  return slots?.active
    ? { state: 'generating', label: '生成中', detail: '正在输出 token' }
    : { state: 'waiting', label: '等待请求', detail: '推理槽位空闲' };
}

function inference(inference) {
  const loaded = Boolean(inference?.connected && inference?.loaded && inference?.model);
  const metrics = inference?.metrics || {};
  const slots = inference?.slots || {};
  const details = inference?.details || {};
  const activity = activityFor(inference, slots);
  const seriesKey = `${inference?.key || ''}|${inference?.backend || ''}|${inference?.model || ''}`;
  if (metricSeries.key !== seriesKey) {
    metricSeries.key = seriesKey;
    metricSeries.gen = [];
    metricSeries.prompt = [];
    renderSpark('gen', metricSeries.gen);
    renderSpark('prompt', metricSeries.prompt);
  }
  set('backendName', inference?.backend || '等待后端');
  set('modelStatus', loaded ? '在线' : '未加载模型');
  set('modelName', loaded ? inference.model : '【未加载模型】');
  if ($('modelName')) $('modelName').title = loaded ? inference.model : '未加载模型';
  set('modelMeta', loaded ? `${inference.url || '本机后端'} · ${activity.label}` : '等待本机后端上报模型参数');
  set('modelArch', loaded ? (details.architecture || '—') : '—');
  set('modelQuant', loaded ? (details.quantization || details.kvType || '—') : '—');
  set('modelContext', loaded && details.contextLength ? `${fmt(details.contextLength)} tokens` : '—');
  const engineName = loaded ? (details.backend || inference.backend || '—') : '—';
  const engineVersion = loaded ? (details.backendVersion || engineName) : '—';
  const expertCount = firstFinite(details.expertSlots, details.experts, details.expertCount, slots.experts);
  const engineKey = String(engineName).toLowerCase();
  set('modelEngine', engineName);
  set('modelExperts', loaded && Number.isFinite(Number(expertCount)) ? fmt(expertCount) : '—');
  set('modelExpertsHint', !loaded
    ? '—'
    : Number.isFinite(Number(expertCount))
      ? (engineKey.includes('strata') ? '内存→显存' : engineKey.includes('maya') ? '显存专家槽' : '后端上报')
      : '不适用');
  $('modelEngine').title = loaded ? `推理引擎 · ${engineVersion}` : '推理引擎';
  $('modelExperts').title = loaded && Number.isFinite(Number(expertCount)) ? `后端上报专家数 · ${fmt(expertCount)}` : '当前引擎未提供专家数';
  set('activityLabel', activity.label || '等待请求');
  set('activityDetail', activity.detail || '推理槽位空闲');
  set('activityState', activity.state || 'waiting');
  const activityCard = document.querySelector('.activity-card');
  if (activityCard) activityCard.dataset.state = activity.state || 'waiting';

  if (!loaded) {
    set('genSpeed', '【未加载模型】');
    set('promptSpeed', '【未加载模型】');
    set('genWindow', '');
    set('promptWindow', '');
    set('contextUsed', '【未加载模型】');
    set('contextTotal', '');
    $('contextBar').style.width = '0%';
    set('contextFoot', inference?.connected ? '模型未加载' : '后端未连接');
    set('taskStatus', '未加载模型');
    set('taskTitle', inference?.connected ? '后端在线，等待模型载入' : '等待推理后端上线');
    set('taskProgress', '—');
    set('taskId', 'IDLE');
    renderSpark('gen', []);
    renderSpark('prompt', []);
    return;
  }

  const generation = Number(metrics.generationSpeed);
  const prompt = Number(metrics.promptSpeed);
  const used = Number(slots.used);
  const total = Number(slots.total);
  set('genSpeed', Number.isFinite(generation) ? generation.toFixed(1) : '—');
  set('promptSpeed', Number.isFinite(prompt) ? fmt(prompt) : '—');
  pushMetric('gen', generation);
  pushMetric('prompt', prompt);
  set('genWindow', Number.isFinite(generation) ? (slots.active ? '实时' : '结束前最后值') : '等待指标');
  set('promptWindow', Number.isFinite(prompt) ? (slots.active ? '实时' : '结束前最后值') : '等待指标');
  set('contextUsed', Number.isFinite(used) ? fmt(used) : '—');
  set('contextTotal', Number.isFinite(total) ? `/ ${fmt(total)}` : '');
  const percent = total ? used / total * 100 : 0;
  $('contextBar').style.width = `${clamp(percent, 0, 100)}%`;
  const queued = Number(slots.queued);
  set('contextFoot', Number.isFinite(used) ? `${percent.toFixed(1)}%${Number.isFinite(queued) && queued > 0 ? ` · 排队 ${queued}` : ''}` : '等待推理请求');
  // 保留“生成中”给共用的平均/峰值统计识别；可见的精确阶段由 activityLabel 展示。
  set('taskStatus', slots.active ? '生成中' : '等待请求');
  set('taskTitle', slots.active ? (slots.task || `当前推理请求 · ${activity.label}`) : '当前没有活动推理请求');
  set('taskProgress', Number.isFinite(used) && Number.isFinite(total) ? `${fmt(used)} / ${fmt(total)} tokens` : '—');
  set('taskId', slots.active ? (Number.isFinite(queued) && queued > 0 ? `QUEUE ${queued}` : 'LIVE TASK') : 'IDLE');
}

function apply(data) {
  if (!data) return;
  const now = new Date().toLocaleTimeString('en-GB', { hour12: false });
  set('clock', now);
  set('footerClock', now);
  const gpuSource = data.source === 'rocm-smi' ? 'rocm-smi' : 'nvidia-smi';
  set('dataSource', `${data.gpus?.length ? `GPU：${gpuSource}` : 'GPU：未检测到 GPU 驱动'} · 主机：Task Manager · ${data.inference?.backend || '后端未连接'}`);
  const power = Number(data.power?.total);
  set('totalPower', Number.isFinite(power) ? fmt(power) : '—');
  set('powerSummary', Number.isFinite(power) ? `GPU 全卡合计 · ${data.power.known || 0}/${data.power.gpuCount || 0} 有效` : 'GPU 全卡合计');
  cpu(data.host);
  memory(data.memory);
  gpus(data.gpus);
  inference(data.inference);
  tokenUsage(data.inference);
  window.renderDailyStats?.(data.inference?.daily);
  const options = [{ key: 'auto', name: '自动' }, ...(data.inference?.backends || []).map((item) => ({ key: item.key, name: `${item.name}${item.loaded ? ' · 已加载' : ''}` }))];
  $('backendSelect').innerHTML = options.map((option) => `<option value="${option.key}">${option.name}</option>`).join('');
  $('backendSelect').value = backend;
}

async function sample() {
  try {
    const response = await fetch(`/api/status?backend=${encodeURIComponent(backend)}`, { cache: 'no-store' });
    if (response.ok) apply(await response.json());
  } catch (_) {}
  timer = setTimeout(sample, intervalMs);
}

$('intervalSlider').addEventListener('input', (event) => {
  intervalMs = Number(event.target.value) * 1000;
  set('intervalValue', `${Number(event.target.value).toFixed(1)}s`);
  clearTimeout(timer);
  sample();
});
$('backendSelect').addEventListener('change', (event) => {
  backend = event.target.value;
  clearTimeout(timer);
  sample();
});
$('refreshBtn').addEventListener('click', () => { clearTimeout(timer); sample(); });
window.addEventListener('resize', () => { fitPage(); fitProcessor(); });
window.visualViewport?.addEventListener('resize', fitPage);
document.fonts?.ready.then(fitPage);
fitPage();
sample();
