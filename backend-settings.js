(() => {
  if (document.getElementById('backend-settings-root')) return;

  const fields = [
    { key: 'vllmUrl', name: 'vLLM / 1Cat', hint: '默认 :8080' },
    { key: 'strataUrl', name: 'Strata', hint: '默认 :8081' },
    { key: 'mayaUrl', name: 'Maya-S', hint: '默认 :8082' },
    { key: 'llamaUrl', name: 'llama.cpp', hint: '默认 :8089' },
    { key: 'lmStudioUrl', name: 'LM Studio', hint: '默认 :1234' },
  ];

  const root = document.createElement('div');
  root.id = 'backend-settings-root';
  root.innerHTML = `
    <button class="bsw-trigger" id="bsw-trigger" type="button" aria-expanded="false" aria-controls="bsw-panel">
      <span class="bsw-trigger-dot" aria-hidden="true"></span>后端设置
    </button>
    <div class="bsw-backdrop" id="bsw-backdrop" hidden></div>
    <section class="bsw-panel" id="bsw-panel" role="dialog" aria-modal="true" aria-labelledby="bsw-title" hidden>
      <header class="bsw-header">
        <div>
          <span class="bsw-kicker">BACKEND ROUTING</span>
          <h2 id="bsw-title">后端设置</h2>
          <p>为这台机器填写各推理服务地址。所有配置只保存在本机服务端。</p>
        </div>
        <button class="bsw-close" id="bsw-close" type="button" aria-label="关闭后端设置">×</button>
      </header>
      <form class="bsw-form" id="bsw-form">
        <div class="bsw-fields">
          ${fields.map((field) => `
            <label class="bsw-field" for="bsw-${field.key}">
              <span class="bsw-field-label"><b>${field.name}</b><small>${field.hint}</small></span>
              <input class="bsw-input" id="bsw-${field.key}" data-setting="${field.key}" type="url"
                inputmode="url" spellcheck="false" autocomplete="off" placeholder="http://127.0.0.1:端口">
              <small class="bsw-result" data-result="${field.key}">未测试</small>
            </label>
          `).join('')}
        </div>
        <p class="bsw-note">填写服务根地址，不要附加 <code>/v1</code>。留空会恢复该后端默认地址；API Key 仍由启动脚本或环境变量提供。</p>
        <div class="bsw-status" id="bsw-status" role="status" aria-live="polite">正在读取当前配置…</div>
        <div class="bsw-actions">
          <button class="bsw-button" id="bsw-test" type="button">测试全部连接</button>
          <button class="bsw-button" id="bsw-defaults" type="button">填入默认地址</button>
          <button class="bsw-button primary" id="bsw-save" type="submit">保存并刷新</button>
          <button class="bsw-button" id="bsw-cancel" type="button">取消</button>
        </div>
      </form>
    </section>
  `;
  document.body.appendChild(root);

  const trigger = root.querySelector('#bsw-trigger');
  const backdrop = root.querySelector('#bsw-backdrop');
  const panel = root.querySelector('#bsw-panel');
  const form = root.querySelector('#bsw-form');
  const status = root.querySelector('#bsw-status');
  const inputs = new Map(fields.map((field) => [field.key, root.querySelector(`#bsw-${field.key}`)]));
  const results = new Map(fields.map((field) => [field.key, root.querySelector(`[data-result="${field.key}"]`)]));
  const testButton = root.querySelector('#bsw-test');
  const defaultsButton = root.querySelector('#bsw-defaults');
  const saveButton = root.querySelector('#bsw-save');
  let defaults = {};
  let loaded = false;
  let loading = null;
  let previousFocus = null;

  function currentValues() {
    return Object.fromEntries([...inputs].map(([key, input]) => [key, input.value.trim()]));
  }

  function fillValues(values) {
    for (const [key, input] of inputs) input.value = values[key] || '';
  }

  function setStatus(message, state = '') {
    status.textContent = message;
    status.dataset.state = state;
  }

  function setResults(message, state = '') {
    for (const result of results.values()) {
      result.textContent = message;
      result.dataset.state = state;
    }
  }

  function setBusy(busy, label = '') {
    form.setAttribute('aria-busy', String(busy));
    testButton.disabled = busy;
    defaultsButton.disabled = busy;
    saveButton.disabled = busy;
    if (busy && label) status.textContent = label;
  }

  async function requestJson(url, options = {}) {
    const response = await fetch(url, {
      cache: 'no-store',
      ...options,
      headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers,
    });
    let payload = {};
    try {
      payload = await response.json();
    } catch (_) {}
    if (!response.ok) throw new Error(payload.error || `请求失败（HTTP ${response.status}）`);
    return payload;
  }

  async function loadSettings() {
    if (loaded) return;
    if (loading) return loading;
    loading = (async () => {
      setBusy(true, '正在读取当前配置…');
      try {
        const payload = await requestJson('/api/settings');
        defaults = payload.defaults || {};
        fillValues({ ...defaults, ...payload.values });
        setResults('未测试');
        setStatus('已读取当前配置。可以逐个测试，或直接保存。');
        loaded = true;
      } catch (error) {
        setStatus(`读取失败：${error.message}`, 'error');
      } finally {
        setBusy(false);
        loading = null;
      }
    })();
    return loading;
  }

  function openPanel() {
    previousFocus = document.activeElement;
    panel.hidden = false;
    backdrop.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    loadSettings();
    requestAnimationFrame(() => root.querySelector('#bsw-close').focus());
  }

  function closePanel() {
    panel.hidden = true;
    backdrop.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  }

  trigger.addEventListener('click', openPanel);
  root.querySelector('#bsw-close').addEventListener('click', closePanel);
  root.querySelector('#bsw-cancel').addEventListener('click', closePanel);
  backdrop.addEventListener('click', closePanel);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !panel.hidden) {
      event.preventDefault();
      closePanel();
    }
  }, true);

  defaultsButton.addEventListener('click', () => {
    fillValues(defaults);
    setResults('未测试');
    setStatus('已填入默认地址，点击“保存并刷新”后生效。');
  });

  testButton.addEventListener('click', async () => {
    setBusy(true, '正在并行测试五个后端…');
    setResults('连接中…', 'working');
    try {
      const payload = await requestJson('/api/settings/test', {
        method: 'POST',
        body: JSON.stringify(currentValues()),
      });
      let passed = 0;
      for (const result of payload.results || []) {
        const element = results.get(result.key);
        if (!element) continue;
        element.textContent = `${result.ok ? '通过' : '失败'} · ${result.detail}`;
        element.dataset.state = result.ok ? 'ok' : 'error';
        element.title = result.endpoint || result.url || '';
        if (result.ok) passed += 1;
      }
      setStatus(`检测完成：${passed}/${fields.length} 个后端可连接。未保存当前输入。`, passed ? 'success' : 'error');
    } catch (error) {
      setResults('测试失败', 'error');
      setStatus(`测试失败：${error.message}`, 'error');
    } finally {
      setBusy(false);
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setBusy(true, '正在保存配置…');
    try {
      const payload = await requestJson('/api/settings', {
        method: 'POST',
        body: JSON.stringify(currentValues()),
      });
      fillValues({ ...defaults, ...payload.values });
      setStatus('已保存，正在刷新工作台…', 'success');
      window.setTimeout(() => window.location.reload(), 350);
    } catch (error) {
      setStatus(`保存失败：${error.message}`, 'error');
      setBusy(false);
    }
  });
})();
