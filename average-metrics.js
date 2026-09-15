(function () {
  const $ = (id) => document.getElementById(id);
  const state = { active: false, model: '', gen: [], prompt: [] };
  try {
    const saved = JSON.parse(localStorage.getItem('nexus-average-metrics') || 'null');
    if (saved && typeof saved === 'object') {
      state.active = Boolean(saved.active);
      state.model = typeof saved.model === 'string' ? saved.model : '';
      state.gen = Array.isArray(saved.gen) ? saved.gen.filter(Number.isFinite).slice(-1200) : [];
      state.prompt = Array.isArray(saved.prompt) ? saved.prompt.filter(Number.isFinite).slice(-1200) : [];
    }
  } catch (_) {}
  const save = () => { try { localStorage.setItem('nexus-average-metrics', JSON.stringify(state)); } catch (_) {} };
  const ensure = (id, anchorId) => {
    if ($(id)) return;
    const anchor = $(anchorId);
    if (!anchor) return;
    const line = document.createElement('small');
    line.className = 'average-metric';
    line.innerHTML = '平均 <b id="' + id + '">—</b> tok/s';
    anchor.insertAdjacentElement('afterend', line);
  };
  const numberFrom = (id) => {
    const text = ($(id)?.textContent || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return text ? Number(text[0]) : null;
  };
  const mean = (values) => values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : '—';
  function tick() {
    ensure('genAverage', 'genWindow');
    ensure('promptAverage', 'promptWindow');
    const modelStatus = ($('modelStatus')?.textContent || '').trim();
    const model = ($('modelName')?.textContent || '').trim();
    const task = ($('taskStatus')?.textContent || '').trim();
    const loaded = model && !model.includes('未加载模型') && !modelStatus.includes('未加载模型');
    const active = loaded && (task.includes('生成中') || task.toUpperCase().includes('ACTIVE'));
    if (!loaded) {
      state.active = false; state.model = ''; state.gen = []; state.prompt = [];
      if ($('genAverage')) $('genAverage').textContent = '—';
      if ($('promptAverage')) $('promptAverage').textContent = '—';
      save();
      return;
    }
    if (state.model !== model || (active && !state.active)) {
      state.model = model; state.gen = []; state.prompt = [];
    }
    if (active) {
      const gen = numberFrom('genSpeed');
      const prompt = numberFrom('promptSpeed');
      if (Number.isFinite(gen)) state.gen.push(gen);
      if (Number.isFinite(prompt)) state.prompt.push(prompt);
    }
    state.active = active;
    if ($('genAverage')) $('genAverage').textContent = mean(state.gen);
    if ($('promptAverage')) $('promptAverage').textContent = mean(state.prompt);
    save();
  }
  setInterval(tick, 250);
  tick();
}());
