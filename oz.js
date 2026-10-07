// 绿野仙踪皮肤：与其它皮肤共用 /api/status，只负责把这套花园的界面填满。
const $ = (id) => document.getElementById(id);
const fmt = (value) => Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString('en-US') : '—';
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

let backend = 'auto';
let intervalMs = 1200;
let timer = null;

function set(id, value) {
  const element = $(id);
  if (element) element.textContent = value;
}

// 处理器型号可能很长：逐级缩小字号，让它在卡片里保持单行。
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

function cpu(host) {
  const percent = Number(host?.cpuPercent);
  const threads = Number(host?.logicalProcessors);
  const speed = Number(host?.cpuSpeedMHz);
  set('cpuModel', host?.cpuModel || '本机处理器');
  set('cpuSub', host?.cpuModel ? 'PROCESSOR TELEMETRY' : 'PROCESSOR MODEL UNAVAILABLE');
  set('cpuPct', Number.isFinite(percent) ? `${percent.toFixed(1)}%` : '—');
  set('cpuLoadBig', Number.isFinite(percent) ? `${percent.toFixed(1)}%` : '—');
  set('cpuClock', Number.isFinite(speed) ? Math.round(speed).toLocaleString('en-US') : '—');
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
    return `<article class="gpu-card">
      <span class="gpu-tag">GPU${gpu.id} · NVIDIA</span>
      <h3>${gpu.name || 'NVIDIA GPU'}</h3>
      <p>设备状态 · ${gpu.pstate || '—'} · nvidia-smi</p>
      <div class="gpu-stats">
        <div><span>利用率</span><strong class="blossom-text">${Number.isFinite(gpu.util) ? Math.round(gpu.util) : '—'}%</strong><div class="meter"><i style="width:${clamp(gpu.util || 0, 0, 100)}%"></i></div></div>
        <div><span>显存</span><strong>${fmt(gpu.memory)} <small>/ ${fmt(gpu.memoryTotal)} MB</small></strong><div class="meter"><i style="width:${clamp(memoryPercent, 0, 100)}%"></i></div></div>
        <div><span>温度</span><strong class="sun-text">${Number.isFinite(gpu.temp) ? Math.round(gpu.temp) : '—'}°C</strong></div>
        <div><span>功耗</span><strong>${Number.isFinite(gpu.power) ? Math.round(gpu.power) : '—'} <small>/ ${powerLimit} W</small></strong></div>
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
  set('totalTokens', Number.isFinite(total) ? fmt(total) : '—');
  set('tokenNote', Number.isFinite(total) ? (slots.active ? '当前推理实时统计' : '最近一次推理统计') : '等待后端返回 token 明细');
}

function inference(inference) {
  const loaded = Boolean(inference?.connected && inference?.loaded && inference?.model);
  const metrics = inference?.metrics || {};
  const slots = inference?.slots || {};
  set('backendName', inference?.backend || '等待后端');
  set('modelStatus', loaded ? '在线' : '未加载模型');
  set('modelName', loaded ? inference.model : '【未加载模型】');
  set('modelMeta', loaded ? `${inference.url || '本机后端'} · ${slots.active ? '生成中' : '空闲'}` : '等待本机后端上报模型参数');
  set('modelArch', loaded ? (inference?.details?.architecture || '—') : '—');
  set('modelQuant', loaded ? (inference?.details?.quantization || '—') : '—');
  set('modelContext', loaded && inference?.details?.contextLength ? `${fmt(inference.details.contextLength)} tokens` : '—');
  if (!loaded) {
    set('genSpeed', '【未加载模型】');
    set('promptSpeed', '【未加载模型】');
    set('genWindow', '');
    set('promptWindow', '');
    set('contextUsed', '【未加载模型】');
    set('contextTotal', '');
    $('contextBar').style.width = '0%';
    set('contextFoot', '');
    set('taskStatus', '未加载模型');
    set('taskTitle', '【未加载模型】');
    set('taskProgress', '【未加载模型】');
    set('taskId', 'IDLE');
    return;
  }
  const generation = Number(metrics.generationSpeed);
  const prompt = Number(metrics.promptSpeed);
  const used = Number(slots.used);
  const total = Number(slots.total);
  set('genSpeed', Number.isFinite(generation) ? generation.toFixed(1) : '—');
  set('promptSpeed', Number.isFinite(prompt) ? fmt(prompt) : '—');
  set('genWindow', Number.isFinite(generation) ? (slots.active ? '实时' : '结束前最后值') : '等待指标');
  set('promptWindow', Number.isFinite(prompt) ? (slots.active ? '实时' : '结束前最后值') : '等待指标');
  set('contextUsed', Number.isFinite(used) ? fmt(used) : '—');
  set('contextTotal', Number.isFinite(total) ? `/ ${fmt(total)}` : '');
  const percent = total ? used / total * 100 : 0;
  $('contextBar').style.width = `${clamp(percent, 0, 100)}%`;
  set('contextFoot', Number.isFinite(used) ? `${percent.toFixed(1)}% · ${slots.active ? 'ACTIVE' : 'LAST SNAPSHOT'}` : '等待推理请求');
  set('taskStatus', slots.active ? '生成中' : '无运行任务');
  set('taskTitle', slots.active ? (slots.task || '当前推理请求') : '当前没有活动推理请求');
  set('taskProgress', Number.isFinite(used) && Number.isFinite(total) ? `${fmt(used)} / ${fmt(total)} tokens` : '—');
  set('taskId', slots.active ? 'LIVE TASK' : 'IDLE');
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
window.addEventListener('resize', fitProcessor);
sample();
