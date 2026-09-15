(function () {
  const $ = (id) => document.getElementById(id);
  const fmt = (value) => Number.isFinite(Number(value)) ? Math.round(Number(value)).toLocaleString('en-US') : '—';
  window.renderDailyStats = function (daily) {
    const loaded = daily && Number.isFinite(Number(daily.generatedTokens));
    if ($('dailyInput')) $('dailyInput').textContent = loaded ? fmt(daily.promptTokens) : '—';
    if ($('dailyOutput')) $('dailyOutput').textContent = loaded ? fmt(daily.generatedTokens) : '—';
    if ($('dailyTotal')) $('dailyTotal').textContent = loaded ? fmt(daily.totalTokens) : '—';
    if ($('dailyRequests')) $('dailyRequests').textContent = loaded ? `${fmt(daily.requests)} 个已完成请求 · ${daily.date || '今日'}` : '等待 LM Studio 日志';
  };
}());
