(function () {
  const $ = (id) => document.getElementById(id);
  const fmt = (value) => Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString('en-US') : '—';
  // 只有原生控制台加载 i18n.js，其它皮肤要靠这里的兜底字典，否则会直接显示键名。
  const FALLBACK = { requests_done: '个已完成请求', today: '今日', wait_daily: '等待后端上报今日累计' };
  const t = (key) => (window.i18n ? window.i18n.t(key) : (FALLBACK[key] || key));
  window.renderDailyStats = function (daily) {
    const loaded = daily && Number.isFinite(Number(daily.generatedTokens));
    if ($('dailyInput')) $('dailyInput').textContent = loaded ? fmt(daily.promptTokens) : '—';
    if ($('dailyOutput')) $('dailyOutput').textContent = loaded ? fmt(daily.generatedTokens) : '—';
    if ($('dailyTotal')) $('dailyTotal').textContent = loaded ? fmt(daily.totalTokens) : '—';
    const reqEl = $('dailyRequests');
    if (reqEl) {
      reqEl.textContent = loaded
        ? fmt(daily.requests) + ' ' + t('requests_done') + ' \u00b7 ' + (daily.date || t('today')) + (daily.source ? ' \u00b7 ' + daily.source : '')
        : t('wait_daily');
    }
  };
}());
