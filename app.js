const state = {
  live: true,
  eventsLive: true,
  apiAvailable: false,
  nvidiaAvailable: false,
  gpuSource: 'nvidia-smi',
  modelLoaded: false,
  intervalMs: 1200,
  intervalTimer: null,
  backendChoice: 'auto',
  powerCurrent: null,
  powerPeak: null,
  tick: 0,
  uptime: 2 * 3600 + 14 * 60 + 38,
  context: 2737,
  taskTokens: 2737,
  gpus: [],
  speed: 88.4,
  prompt: 1842,
  cpu: 18.1,
  ram: 9.9,
  ramUsedBytes: 3.1 * 1073741824,
  ramTotalBytes: 31.3 * 1073741824,
  host: { available: false, logicalProcessors: 0, disk: {}, process: null },
  histories: { gen: [79, 81, 84, 82, 87, 85, 88, 86, 90, 88, 91, 88], prompt: [1640, 1730, 1690, 1770, 1810, 1860, 1790, 1880, 1840, 1890, 1842], cpu: [18, 20, 17, 21, 19, 18, 22, 20, 18, 19, 18, 18] },
};

const $ = (id) => document.getElementById(id);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const MODEL_UNAVAILABLE = '【未加载模型】';

function setStrong(id, value, unavailable = false) {
  const element = $(id);
  element.textContent = value;
  element.classList.toggle('unavailable', unavailable);
}

function setModelUnavailable() {
  state.modelLoaded = false;
  $('modelArch').textContent = '—'; $('modelQuant').textContent = '—'; $('modelContext').textContent = '—'; $('modelRuntime').textContent = '—';
  setStrong('genSpeed', MODEL_UNAVAILABLE, true); $('genUnit').textContent = '';
  setStrong('promptSpeed', MODEL_UNAVAILABLE, true); $('promptUnit').textContent = '';
  setStrong('contextUsed', MODEL_UNAVAILABLE, true); $('contextTotal').textContent = '';
  $('contextBar').style.width = '0%'; $('contextFoot').textContent = MODEL_UNAVAILABLE; $('contextRemaining').textContent = '—';
  $('genTrend').textContent = ''; $('promptTrend').textContent = ''; $('genWindow').textContent = '—'; $('promptWindow').textContent = '—';
  $('taskStatus').textContent = MODEL_UNAVAILABLE; $('taskTitle').textContent = MODEL_UNAVAILABLE; $('taskTitle').classList.add('unavailable');
  $('taskId').textContent = '—'; $('taskProgress').textContent = MODEL_UNAVAILABLE; $('taskPct').textContent = '—'; $('taskBar').style.width = '0%';
  $('taskStarted').textContent = '—'; $('taskEta').textContent = '—'; $('taskModel').textContent = '—'; $('taskPulse').style.display = 'none';
  $('genSpark').innerHTML = ''; $('promptSpark').innerHTML = '';
}

function setModelLoaded(inference) {
  state.modelLoaded = true;
  $('modelName').textContent = inference.model || '本机推理模型';
  $('modelStatus').textContent = '在线'; $('modelStatus').classList.remove('not-loaded');
  $('backendName').textContent = inference.backend || '本机后端';
  const details = inference.details || {};
  $('modelArch').textContent = [details.architecture, details.parameters].filter(Boolean).join(' · ') || '—';
  $('modelQuant').textContent = [details.quantization, details.format?.toUpperCase()].filter(Boolean).join(' · ') || '—';
  $('modelContext').textContent = Number.isFinite(details.contextLength) ? `${fmt(details.contextLength)} tokens` : '—';
  const runtime = [];
  if (details.backendVersion) runtime.push(details.backendVersion);
  if (Number.isFinite(details.evalBatchSize)) runtime.push(`Batch ${fmt(details.evalBatchSize)}`);
  if (Number.isFinite(details.parallel)) runtime.push(`并行 ${details.parallel}`);
  if (details.kvType) runtime.push(`KV ${details.kvType}`);
  if (Number.isFinite(details.expertSlots)) runtime.push(`专家槽 ${fmt(details.expertSlots)}`);
  if (details.flashAttention) runtime.push('Flash Attn');
  if (details.mtp) runtime.push('MTP');
  $('modelRuntime').textContent = runtime.join(' · ') || '—';
  const generationSpeed = inference.metrics?.generationSpeed;
  const promptSpeed = inference.metrics?.promptSpeed;
  const metricsLive = Boolean(inference.slots?.active);
  if (Number.isFinite(generationSpeed)) { state.speed = generationSpeed; state.histories.gen.push(generationSpeed); state.histories.gen.shift(); $('genSpark').innerHTML = sparkline(state.histories.gen, '#63e6e2'); }
  if (Number.isFinite(promptSpeed)) { state.prompt = promptSpeed; state.histories.prompt.push(promptSpeed); state.histories.prompt.shift(); $('promptSpark').innerHTML = sparkline(state.histories.prompt, '#a991ff'); }
  setStrong('genSpeed', Number.isFinite(generationSpeed) ? generationSpeed.toFixed(1) : '—'); $('genUnit').textContent = Number.isFinite(generationSpeed) ? 'tok/s' : '';
  setStrong('promptSpeed', Number.isFinite(promptSpeed) ? fmt(promptSpeed) : '—'); $('promptUnit').textContent = Number.isFinite(promptSpeed) ? 'tok/s' : '';
  $('genTrend').textContent = Number.isFinite(generationSpeed) ? (metricsLive ? '实时' : '最近') : ''; $('promptTrend').textContent = Number.isFinite(promptSpeed) ? (metricsLive ? '实时' : '最近') : '';
  $('genWindow').textContent = Number.isFinite(generationSpeed) ? (metricsLive ? '后端 metrics' : '结束前最后值') : '等待指标'; $('promptWindow').textContent = Number.isFinite(promptSpeed) ? (metricsLive ? '后端 metrics' : '结束前最后值') : '等待指标';
  const context = inference.slots;
  if (Number.isFinite(context?.used)) {
    setStrong('contextUsed', fmt(context.used)); $('contextTotal').textContent = Number.isFinite(context.total) ? `/ ${fmt(context.total)}` : '';
    const percent = Number.isFinite(context.total) && context.total > 0 ? context.used / context.total * 100 : 0;
    $('contextBar').style.width = `${clamp(percent, 0, 100)}%`; $('contextFoot').innerHTML = `占用率 <b>${percent.toFixed(1)}%</b>`; $('contextRemaining').textContent = Number.isFinite(context.total) ? `剩余 ${fmt(Math.max(0, context.total - context.used))}` : '—';
  } else {
    setStrong('contextUsed', '—');
    const knownTotal = Number(context?.total || details.contextLength);
    $('contextTotal').textContent = Number.isFinite(knownTotal) ? `/ ${fmt(knownTotal)}` : '';
    $('contextBar').style.width = '0%'; $('contextFoot').textContent = '等待推理请求'; $('contextRemaining').textContent = Number.isFinite(knownTotal) ? `容量 ${fmt(knownTotal)}` : '—';
  }
  if (context?.active) {
    $('taskStatus').textContent = '生成中'; $('taskTitle').textContent = context.task || '当前推理请求'; $('taskTitle').classList.remove('unavailable'); $('taskId').textContent = 'LIVE TASK'; $('taskPulse').style.display = '';
    $('taskProgress').textContent = Number.isFinite(context.used) && Number.isFinite(context.total) ? `${fmt(context.used)} / ${fmt(context.total)} tokens` : '上下文处理中'; $('taskPct').textContent = Number.isFinite(context.used) && Number.isFinite(context.total) ? `${Math.max(1, Math.round(context.used / context.total * 100))}%` : '—'; $('taskBar').style.width = Number.isFinite(context.used) && Number.isFinite(context.total) ? `${clamp(context.used / context.total * 100, 0, 100)}%` : '0%'; $('taskModel').textContent = inference.model || '本机模型';
  } else {
    $('taskStatus').textContent = '无运行任务'; $('taskTitle').textContent = '当前没有活动推理请求'; $('taskTitle').classList.remove('unavailable'); $('taskId').textContent = 'IDLE'; $('taskPulse').style.display = 'none'; $('taskProgress').textContent = '等待新的请求'; $('taskPct').textContent = '—'; $('taskBar').style.width = '0%'; $('taskStarted').textContent = '—'; $('taskEta').textContent = '—'; $('taskModel').textContent = inference.model || '本机模型';
  }
}

async function fetchRealStatus() {
  try {
    const response = await fetch(`/api/status?backend=${encodeURIComponent(state.backendChoice)}`, { cache: 'no-store' });
    if (!response.ok) return null;
    return await response.json();
  } catch (_) { return null; }
}

function applyRealStatus(data) {
  if (!data) return false;
  state.apiAvailable = true;
  const inference = data.inference || { connected: false, loaded: false, backend: '未检测到推理后端' };
  updateBackendOptions(inference.backends || [], inference.key || state.backendChoice);
  const loaded = Boolean(inference.connected && inference.loaded && inference.model);
  if (Array.isArray(data.gpus) && data.gpus.length) {
    state.gpus = data.gpus;
    state.nvidiaAvailable = true;
    state.gpuSource = data.source === 'rocm-smi' ? 'rocm-smi' : 'nvidia-smi';
  } else {
    state.gpus = [];
    state.nvidiaAvailable = false;
    state.gpuSource = 'none';
  }
  const host = data.host || {};
  state.host = { ...host, available: true };
  if (Number.isFinite(host.cpuPercent)) state.cpu = host.cpuPercent;
  if (host.memory?.total) {
    state.ramTotalBytes = host.memory.total;
    state.ramUsedBytes = host.memory.used;
    state.ram = host.memory.used / host.memory.total * 100;
  }
  if (loaded) {
    setModelLoaded(inference);
    $('modelStatus').classList.remove('not-loaded');
  } else {
    setModelUnavailable();
    $('modelName').textContent = MODEL_UNAVAILABLE;
    $('modelStatus').textContent = MODEL_UNAVAILABLE;
    $('modelStatus').classList.add('not-loaded');
    $('backendName').textContent = inference.connected ? `${inference.backend} · 未加载` : '未连接';
  }
  window.renderDailyStats?.(inference.daily);
  const power = Number(data.power?.total);
  if (state.nvidiaAvailable && Number.isFinite(power)) {
    const previousPower = state.powerCurrent;
    state.powerCurrent = power;
    state.powerPeak = Math.max(state.powerPeak || 0, power);
    $('totalPower').textContent = fmt(power);
    $('powerUnit').textContent = 'W';
    $('powerPeak').textContent = `峰值 ${fmt(state.powerPeak)} W`;
    const known = Number(data.power?.known) || 0; const gpuCount = Number(data.power?.gpuCount) || state.gpus.length;
    $('powerSummary').textContent = known < gpuCount ? `nvidia-smi 全卡合计 · ${known}/${gpuCount} 有效` : 'nvidia-smi 全卡合计';
    if (state.eventsLive && Number.isFinite(previousPower) && Math.abs(previousPower - power) >= 1) addEvent('功耗', `全卡合计 ${fmt(power)} W`);
  } else {
    state.powerCurrent = null;
    $('totalPower').textContent = '—'; $('powerUnit').textContent = ''; $('powerPeak').textContent = '—'; $('powerSummary').textContent = '等待 nvidia-smi';
  }
  const backendLabel = inference.connected ? `${inference.backend}${loaded ? ' 已加载模型' : ' 未加载模型'}` : '未检测到 llama.cpp / LM Studio / Strata';
  $('dataSource').textContent = `${state.nvidiaAvailable ? 'GPU：' + state.gpuSource : 'GPU：未检测到 GPU 驱动'} · 主机：Task Manager 性能计数器 · ${backendLabel}`;
  renderGpus(); renderSystem();
  return true;
}

function updateBackendOptions(backends, selectedKey) {
  const select = $('backendSelect');
  const current = state.backendChoice;
  const options = [{ key: 'auto', label: '自动' }, ...backends.map((backend) => ({ key: backend.key, label: `${backend.name}${backend.loaded ? ' · 已加载' : ''}` }))];
  select.innerHTML = options.map((option) => `<option value="${option.key}">${option.label}</option>`).join('');
  const desired = current !== 'auto' && backends.some((backend) => backend.key === current) ? current : (current === 'auto' ? 'auto' : selectedKey || 'auto');
  select.value = desired;
  if (current === 'auto' || selectedKey === current) state.backendChoice = desired;
}

function sparkline(values, color) {
  const min = Math.min(...values), max = Math.max(...values), span = Math.max(1, max - min);
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${35 - ((value - min) / span) * 28}`).join(' ');
  const area = `0,38 ${points} 100,38`;
  return `<svg viewBox="0 0 100 38" preserveAspectRatio="none" aria-hidden="true"><path d="M ${area.replaceAll(',', ' ')} Z" style="fill:${color}"></path><polyline points="${points}" style="stroke:${color}"></polyline></svg>`;
}

function renderGpus() {
  if (!state.gpus.length) {
    $('gpuGrid').innerHTML = '<article class="gpu-card gpu-empty"><div class="gpu-empty-title">未检测到 GPU</div><div class="gpu-empty-note">NVIDIA：请安装驱动并确认 nvidia-smi 可用；AMD：请安装 ROCm 并确认 rocm-smi 可用。</div></article>';
    return;
  }
  $('gpuGrid').innerHTML = state.gpus.map((gpu) => {
    const memPct = gpu.memoryTotal ? gpu.memory / gpu.memoryTotal * 100 : 0;
    const powerText = Number.isFinite(gpu.power) ? `${Math.round(gpu.power)} / ${Number.isFinite(gpu.powerLimit) ? Math.round(gpu.powerLimit) : '—'} W` : `— / ${Number.isFinite(gpu.powerLimit) ? Math.round(gpu.powerLimit) : '—'} W`;
    return `<article class="gpu-card">
      <div class="gpu-card-head"><div class="gpu-name"><div class="gpu-badge">GPU${gpu.id}</div><div><strong>${gpu.name}</strong><small>LOCAL GPU</small></div></div><span class="gpu-live">● ONLINE</span></div>
      <div class="gpu-body">
        <div class="gauge-row"><div class="gauge-label"><span>利用率</span><b class="cyan">${gpu.util}%</b></div><div class="gauge"><i style="width:${gpu.util}%"></i></div></div>
        <div class="gauge-row"><div class="gauge-label"><span>显存 ${fmt(gpu.memory)} / ${fmt(gpu.memoryTotal)} MB</span><b class="amber">${Math.round(memPct)}%</b></div><div class="gauge memory"><i style="width:${memPct}%"></i></div></div>
        <div class="gpu-specs"><div><b>温度</b><span>${Number.isFinite(gpu.temp) ? `${Math.round(gpu.temp)}°C` : '—'}</span></div><div><b>功耗</b><span>${powerText}</span></div><div><b>风扇</b><span>${Number.isFinite(gpu.fan) ? `${Math.round(gpu.fan)}%` : '—'}</span></div><div><b>频率</b><span>${Number.isFinite(gpu.clock) ? `${Math.round(gpu.clock)} MHz` : '—'}</span></div></div>
        <div class="gpu-specs"><div><b>P-State</b><span>${gpu.pstate}</span></div><div><b>ECC</b><span>—</span></div><div style="grid-column:span 2"><b>进程</b><span>${gpu.proc}</span></div></div>
      </div>
    </article>`;
  }).join('');
}

function renderSystem() {
  const host = state.host || {};
  const cpu = Number.isFinite(host.cpuPercent) ? host.cpuPercent : state.cpu;
  const total = state.ramTotalBytes || 0;
  const used = state.ramUsedBytes || 0;
  const totalGb = total ? total / 1073741824 : 0;
  const usedGb = used ? used / 1073741824 : 0;
  const freeGb = Math.max(0, totalGb - usedGb);
  $('cpuPct').textContent = Number.isFinite(cpu) ? `${cpu.toFixed(1)}%` : '—';
  $('cpuCores').textContent = host.logicalProcessors ? `${host.logicalProcessors} 逻辑处理器` : 'Task Manager';
  $('ramPct').textContent = total ? `${(used / total * 100).toFixed(1)}%` : '—';
  $('ramText').innerHTML = total ? `${usedGb.toFixed(1)}<span>/${totalGb.toFixed(1)} GB</span>` : '—<span>/— GB</span>';
  $('ramRing').style.background = `conic-gradient(var(--violet) ${total ? used / total * 360 : 0}deg, #29313a ${total ? used / total * 360 : 0}deg 360deg)`;
  $('ramCached').textContent = '缓存 —';
  $('ramAvailable').textContent = total ? `可用 ${freeGb.toFixed(1)} GB` : '可用 —';
  const disk = host.disk || {};
  $('diskPct').textContent = Number.isFinite(disk.activePercent) ? `${Math.round(disk.activePercent)}%` : '—';
  $('diskCapacity').textContent = '所有磁盘 · Task Manager';
  $('diskRead').textContent = `读 ${formatRate(disk.readBytesPerSec)}`;
  $('diskWrite').textContent = `写 ${formatRate(disk.writeBytesPerSec)}`;
  const process = host.process;
  $('processName').textContent = process?.name || '未找到推理进程';
  $('processExe').textContent = process?.name ? `${process.name}.exe` : '—';
  $('processPid').textContent = `PID ${process?.pid || '—'}`;
  $('processCpu').textContent = Number.isFinite(process?.cpuPercent) ? `${process.cpuPercent.toFixed(1)}%` : '—';
  $('processMemory').textContent = Number.isFinite(process?.memoryBytes) && process.memoryBytes ? `${(process.memoryBytes / 1073741824).toFixed(1)} GB` : '—';
  $('processStatus').textContent = process ? '服务 active' : '未检测到';
  state.histories.cpu.push(cpu); state.histories.cpu.shift();
  const bars = state.histories.cpu.concat(state.histories.cpu).slice(-25).map((value, i) => `<i style="height:${clamp(10 + Number(value || 0) * 1.2 + Math.sin(state.tick * .45 + i) * 5, 9, 54)}px"></i>`).join('');
  $('cpuBars').innerHTML = bars;
  $('cpuLoad').textContent = Number.isFinite(cpu) ? 'Task Manager 总使用率' : '—';
}

function formatRate(bytesPerSecond) {
  if (!Number.isFinite(bytesPerSecond)) return '—';
  if (bytesPerSecond >= 1073741824) return `${(bytesPerSecond / 1073741824).toFixed(1)} GB/s`;
  if (bytesPerSecond >= 1048576) return `${(bytesPerSecond / 1048576).toFixed(1)} MB/s`;
  if (bytesPerSecond >= 1024) return `${(bytesPerSecond / 1024).toFixed(1)} KB/s`;
  return `${Math.round(bytesPerSecond)} B/s`;
}

function addEvent(type, message) {
  const now = new Date();
  const time = now.toLocaleTimeString('en-GB', { hour12: false });
  const label = type === 'GPU0' ? 'gpu0' : type === 'GPU1' ? 'gpu1' : type === '任务' ? 'task' : 'power';
  const node = document.createElement('div');
  node.className = 'event-item';
  node.innerHTML = `<time>${time}</time><b class="${label}">${type}</b><span>${message}</span>`;
  $('eventList').prepend(node);
  while ($('eventList').children.length > 8) $('eventList').lastElementChild.remove();
}

function sample() {
  if (!state.live) return;
  state.tick += 1;
  state.uptime += 1.2;
  if (!state.modelLoaded) setModelUnavailable();
  else {
    state.speed = clamp(state.speed + (Math.random() - .48) * 3.5, 78, 98);
    state.prompt = clamp(state.prompt + (Math.random() - .5) * 90, 1680, 1980);
    state.context += Math.round(state.speed * 1.2);
    state.taskTokens = state.context;
  }
  state.cpu = clamp(state.cpu + (Math.random() - .5) * 3.8, 10, 30);
  state.ram = clamp(state.ram + (Math.random() - .5) * .45, 8.5, 11.8);
  state.gpus.forEach((gpu, index) => {
    gpu.util = clamp(gpu.util + (Math.random() - .5) * 4.5, 80, 98);
    gpu.memory = clamp(gpu.memory + (Math.random() - .5) * 22, 17300, 18880);
    gpu.temp = clamp(gpu.temp + (Math.random() - .5) * 1.4, 48, 58);
    gpu.power = clamp(gpu.power + (Math.random() - .5) * 9, 260, 316);
    gpu.fan = clamp(gpu.fan + (Math.random() - .5) * 3, 38, 65);
    if (state.tick % 3 === index) addEvent(`GPU${index}`, `${index ? '利用率' : '功耗'} ${index ? gpu.util.toFixed(0) + '%' : gpu.power.toFixed(0) + ' W'}`);
  });
  state.histories.gen.push(state.speed); state.histories.gen.shift();
  state.histories.prompt.push(state.prompt); state.histories.prompt.shift();
  if (state.modelLoaded) {
    $('genSpeed').textContent = state.speed.toFixed(1); $('genUnit').textContent = 'tok/s';
    $('promptSpeed').textContent = fmt(state.prompt); $('promptUnit').textContent = 'tok/s';
    $('contextUsed').textContent = fmt(state.context); $('contextTotal').textContent = '/ 262,144';
    const contextPct = state.context / 262144 * 100;
    $('contextFoot').innerHTML = `占用率 <b>${contextPct.toFixed(1)}%</b>`; $('contextRemaining').textContent = `剩余 ${fmt(Math.max(0, 262144 - state.context))}`; $('contextBar').style.width = `${contextPct}%`;
    $('taskPct').textContent = `${Math.max(1, Math.round(contextPct))}%`; $('taskBar').style.width = `${contextPct}%`;
    $('genSpark').innerHTML = sparkline(state.histories.gen, '#63e6e2'); $('promptSpark').innerHTML = sparkline(state.histories.prompt, '#a991ff');
  }
  if (state.apiAvailable && state.nvidiaAvailable) $('totalPower').textContent = fmt(state.gpus.reduce((sum, gpu) => sum + (Number.isFinite(gpu.power) ? gpu.power : 0), 0));
  else { $('totalPower').textContent = '—'; $('powerUnit').textContent = ''; }
  $('clock').textContent = new Date().toLocaleTimeString('en-GB', { hour12: false });
  renderGpus(); renderSystem();
  if (state.tick % 4 === 0) addEvent('任务', `#1886 生成中 · ${fmt(state.context)} tokens`);
}

function scheduleNextSample() {
  if (state.intervalTimer) clearTimeout(state.intervalTimer);
  state.intervalTimer = setTimeout(runScheduledSample, state.intervalMs);
}

async function runScheduledSample() {
  if (state.live) {
    const real = await fetchRealStatus();
    if (real) {
      applyRealStatus(real);
      state.tick += 1;
      if (state.eventsLive) state.gpus.forEach((gpu) => addEvent(`GPU${gpu.id}`, `利用率 ${Math.round(gpu.util)}% · 温度 ${Number.isFinite(gpu.temp) ? Math.round(gpu.temp) : '—'}°C`));
    } else if (!state.apiAvailable) sample();
  }
  scheduleNextSample();
}

async function refreshNow() {
  const real = await fetchRealStatus();
  if (real) {
    applyRealStatus(real);
    if (state.eventsLive) addEvent('任务', '手动刷新采样快照');
  } else if (!state.apiAvailable) {
    sample();
    addEvent('任务', '手动刷新演示快照');
  }
}

function init() {
  renderGpus(); renderSystem(); setModelUnavailable();
  addEvent('任务', '等待 llama.cpp / LM Studio / Strata 加载模型');
  addEvent('功耗', '等待 nvidia-smi 全卡功耗采样');
  $('liveToggle').addEventListener('change', (event) => { state.live = event.target.checked; $('pauseBtn').querySelector('em').textContent = state.live ? '暂停采样' : '继续采样'; });
  $('pauseBtn').addEventListener('click', () => { state.live = !state.live; $('liveToggle').checked = state.live; $('pauseBtn').querySelector('em').textContent = state.live ? '暂停采样' : '继续采样'; });
  $('eventPause').addEventListener('click', () => { state.eventsLive = !state.eventsLive; $('eventPause').textContent = state.eventsLive ? 'Ⅱ' : '▶'; });
  $('refreshBtn').addEventListener('click', refreshNow);
  $('clearEvents').addEventListener('click', () => { $('eventList').innerHTML = ''; addEvent('任务', '事件流已清空'); });
  $('intervalSlider').addEventListener('input', (event) => {
    const seconds = Number(event.target.value);
    state.intervalMs = seconds * 1000;
    $('intervalValue').textContent = `${seconds.toFixed(1)}s`;
    scheduleNextSample();
  });
  $('backendSelect').addEventListener('change', (event) => {
    state.backendChoice = event.target.value;
    refreshNow();
    scheduleNextSample();
  });
  fetchRealStatus().then((real) => { if (real) applyRealStatus(real); else sample(); scheduleNextSample(); });
}

// 语言切换统一交给 i18n.js（下拉菜单与旧版按钮都能用），这里不再重复绑定。
init();
