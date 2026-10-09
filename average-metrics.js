(function () {
  const $ = (id) => document.getElementById(id);
  const state = { active: false, model: '', gen: [], prompt: [], genPeak: 0, promptPeak: 0 };
  try {
    const saved = JSON.parse(localStorage.getItem('nexus-average-metrics') || 'null');
    if (saved && typeof saved === 'object') {
      state.active = Boolean(saved.active);
      state.model = typeof saved.model === 'string' ? saved.model : '';
      state.gen = Array.isArray(saved.gen) ? saved.gen.filter(Number.isFinite).slice(-1200) : [];
      state.prompt = Array.isArray(saved.prompt) ? saved.prompt.filter(Number.isFinite).slice(-1200) : [];
      state.genPeak = Number.isFinite(saved.genPeak) ? saved.genPeak : 0;
      state.promptPeak = Number.isFinite(saved.promptPeak) ? saved.promptPeak : 0;
    }
  } catch (_) {}
  const save = () => { try { localStorage.setItem('nexus-average-metrics', JSON.stringify(state)); } catch (_) {} };
  // 平均与峰值共用同一个统计窗口：换模型或开始新任务时一起清零，所以两个数字可以直接互相比。
  const ensure = (avgId, peakId, anchorId) => {
    if ($(avgId) && $(peakId)) return;
    const anchor = $(anchorId);
    if (!anchor) return;
    if ($(avgId) && !$(peakId)) {
      // 页面里已经写死了"平均"那一行，只需补上峰值
      const tail = document.createElement('span');
      tail.innerHTML = ' · 峰值 <b id="' + peakId + '">—</b>';
      $(avgId).insertAdjacentElement('afterend', tail);
      return;
    }
    const line = document.createElement('small');
    line.className = 'average-metric';
    line.innerHTML = '平均 <b id="' + avgId + '">—</b> · 峰值 <b id="' + peakId + '">—</b> tok/s';
    anchor.insertAdjacentElement('afterend', line);
  };
  const numberFrom = (id) => {
    const text = ($(id)?.textContent || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return text ? Number(text[0]) : null;
  };
  const mean = (values) => values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : '—';
  const peakText = (value) => Number.isFinite(value) && value > 0 ? value.toFixed(1) : '—';
  function tick() {
    ensure('genAverage', 'genPeak', 'genWindow');
    ensure('promptAverage', 'promptPeak', 'promptWindow');
    const modelStatus = ($('modelStatus')?.textContent || '').trim();
    const model = ($('modelName')?.textContent || '').trim();
    const task = ($('taskStatus')?.textContent || '').trim();
    const loaded = model && !model.includes('未加载模型') && !modelStatus.includes('未加载模型');
    const active = loaded && (task.includes('生成中') || task.toUpperCase().includes('ACTIVE'));
    if (!loaded) {
      state.active = false; state.model = '';
      state.gen = []; state.prompt = []; state.genPeak = 0; state.promptPeak = 0;
      if ($('genAverage')) $('genAverage').textContent = '—';
      if ($('promptAverage')) $('promptAverage').textContent = '—';
      if ($('genPeak')) $('genPeak').textContent = '—';
      if ($('promptPeak')) $('promptPeak').textContent = '—';
      save();
      return;
    }
    if (state.model !== model || (active && !state.active)) {
      state.model = model; state.gen = []; state.prompt = []; state.genPeak = 0; state.promptPeak = 0;
    }
    if (active) {
      const gen = numberFrom('genSpeed');
      const prompt = numberFrom('promptSpeed');
      if (Number.isFinite(gen)) { state.gen.push(gen); state.genPeak = Math.max(state.genPeak, gen); }
      if (Number.isFinite(prompt)) { state.prompt.push(prompt); state.promptPeak = Math.max(state.promptPeak, prompt); }
    }
    state.active = active;
    if ($('genAverage')) $('genAverage').textContent = mean(state.gen);
    if ($('promptAverage')) $('promptAverage').textContent = mean(state.prompt);
    if ($('genPeak')) $('genPeak').textContent = peakText(state.genPeak);
    if ($('promptPeak')) $('promptPeak').textContent = peakText(state.promptPeak);
    save();
  }
  setInterval(tick, 250);
  tick();
}());
