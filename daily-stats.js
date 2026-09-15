(function () {
  const $ = (id) => document.getElementById(id);
  const fmt = (value) => Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString('en-US') : '—';
  const t = (k) => window.i18n ? window.i18n.t(k) : k;
  window.renderDailyStats = function (daily) {
    const loaded = daily && Number.isFinite(Number(daily.generatedTokens));
    if ($('dailyInput')) $('dailyInput').textContent = loaded ? fmt(daily.promptTokens) : '—';
    if ($('dailyOutput')) $('dailyOutput').textContent = loaded ? fmt(daily.generatedTokens) : '—';
    if ($('dailyTotal')) $('dailyTotal').textContent = loaded ? fmt(daily.totalTokens) : '—';
    const reqEl = $('dailyRequests');
    if (reqEl) reqEl.textContent = loaded ? fmt(daily.requests) + ' ' + t('requests_done') + ' \u00b7 ' + (daily.date || t('today')) : t('wait_lm_log');
  };
}());
