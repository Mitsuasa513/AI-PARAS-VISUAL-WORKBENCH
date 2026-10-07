(function () {
  const ZH = {
    "skin": "皮肤",
    "skin_native": "原生控制台",
    "skin_cyberpunk": "霓虹矩阵",
    "skin_apple": "极简原生",
    "skin_scroll": "云水卷轴",
    "skin_oz": "绿野仙踪",
    "live": "实时采样",
    "refresh": "刷新",
    "backend": "后端",
    "auto": "自动",
    "refresh_now": "立即刷新",
    "local_config": "本地配置",
    "workbench": "工作台",
    "overview": "实时总览",
    "daily": "今日累计",
    "daily_wait": "等待 LM Studio 日志",
    "daily_in": "今日输入量",
    "daily_out": "今日输出量",
    "daily_total": "今日总量",
    "prompt_tokens": "PROMPT TOKENS",
    "generated_tokens": "GENERATED TOKENS",
    "input_plus_output": "INPUT + OUTPUT",
    "current_instance": "当前推理实例",
    "no_model": "【未加载模型】",
    "not_loaded": "未加载模型",
    "backend_name": "后端",
    "not_connected": "未连接",
    "arch": "架构",
    "quant": "量化",
    "context": "上下文",
    "runtime": "运行配置",
    "pause": "暂停采样",
    "resume": "继续采样",
    "gen_speed": "生成速度",
    "prompt_speed": "预填充速度",
    "context_used": "上下文占用",
    "total_power": "总功耗",
    "output": "OUTPUT",
    "prompt_eval": "PROMPT EVAL",
    "context_window": "CONTEXT WINDOW",
    "power_draw": "POWER DRAW",
    "avg": "平均",
    "wait_metrics": "等待指标",
    "wait_inference": "等待推理请求",
    "realtime": "实时",
    "last_value": "结束前最后值",
    "wait_lm_log": "等待 LM Studio 日志",
    "wait_daily": "等待后端上报今日累计",
    "daily_source": "数据来源",
    "requests_done": "个已完成请求",
    "today": "今日",
    "gpu_devices": "GPU 设备",
    "gpu_note": "按卡聚合 · 每 1.2s 更新",
    "gpu_online": "ONLINE",
    "running_tasks": "运行任务",
    "task_note": "推理队列与吞吐",
    "clear_events": "清空事件",
    "task_status": "状态",
    "task_title": "标题",
    "task_progress": "进度",
    "task_pct": "百分比",
    "task_started": "开始",
    "task_eta": "预计",
    "task_model": "模型",
    "generating": "生成中",
    "no_task": "无运行任务",
    "event_feed": "事件流",
    "live_feed": "LIVE FEED",
    "pause_events": "暂停事件流",
    "events_cleared": "事件流已清空",
    "host_resources": "主机资源",
    "system_note": "系统级采样",
    "sampling": "采样间隔",
    "cpu": "CPU",
    "memory": "内存",
    "disk": "磁盘",
    "process": "进程",
    "no_inference_proc": "未找到推理进程",
    "sys_mem": "系统内存",
    "cached": "缓存",
    "available": "可用",
    "all_disks": "所有磁盘",
    "win_perf": "Windows 性能计数器",
    "read": "读",
    "write": "写",
    "task_mgr": "Task Manager",
    "task_mgr_total": "Task Manager 总使用率",
    "local_workbench": "LOCAL AI WORKBENCH",
    "data_source_demo": "数据来源：演示采样 · 正在探测本机后端",
    "gpu_none": "未检测到 GPU",
    "gpu_none_note": "NVIDIA：请安装驱动并确认 nvidia-smi 可用；AMD：请安装 ROCm 并确认 rocm-smi 可用。",
    "gpu_none_wait": "等待 nvidia-smi 或 rocm-smi 返回设备信息",
    "gpu_util": "利用率",
    "gpu_mem": "显存",
    "gpu_temp": "温度",
    "gpu_power": "功耗",
    "gpu_fan": "风扇",
    "gpu_clock": "频率",
    "gpu_pstate": "P-State",
    "gpu_ecc": "ECC",
    "gpu_proc": "进程",
    "gpu_local": "本机 GPU",
    "gpu_power_bus": "GPU 全卡合计",
    "gpu_valid": "有效",
    "gpu_not_detected": "未检测到 GPU 驱动",
    "gpu_wait": "等待 GPU 驱动",
    "mem_gb": "GB",
    "ctx_tokens": "tokens",
    "batch": "Batch",
    "parallel": "并行",
    "flash_attn": "Flash Attn",
    "mtp": "MTP",
    "online": "在线",
    "idle": "空闲",
    "active_job": "ACTIVE JOB",
    "last_snapshot": "LAST SNAPSHOT",
    "live_task": "LIVE TASK",
    "local_backend": "本机后端",
    "wait_backend": "等待后端",
    "wait_backend_info": "等待本机后端上报模型信息",
    "wait_backend_params": "等待本机后端上报模型参数",
    "detected_backend": "未检测到 llama.cpp / LM Studio",
    "model_loaded": "已加载模型",
    "model_not_loaded": "未加载模型",
    "gpu_array": "GPU ARRAY",
    "gpu_array_offline": "GPU ARRAY // OFFLINE",
    "gpu_code_online": "ONLINE",
    "core_util": "核心利用率",
    "mem_usage": "显存占用",
    "power_limit": "W",
    "nvidia_power_bus": "NVIDIA POWER BUS",
    "gpu_power_bus_en": "GPU POWER BUS",
    "valid": "VALID",
    "pci_acc": "PCIe ACCELERATOR",
    "p_state": "P-STATE",
    "device_status": "设备状态",
    "local_sampling": "本机采样",
    "gpu_tag": "GPU",
    "gpu_count_online": "在线",
    "ctx_occupied": "占用率",
    "ctx_remaining": "剩余",
    "power_summary_wait": "等待 GPU 驱动",
    "nvidia_all_card": "nvidia-smi 全卡合计",
    "rocm_all_card": "rocm-smi 全卡合计",
    "all_card": "全卡合计",

    /* ---- 五套皮肤共用的界面文案：反查字典用（DOM 里的中文按值反查成英文） ---- */
    "lang": "语言",
    "z_host_local": "本机处理器",
    "z_local_model": "本机模型",
    "z_local_model_alt": "本机推理模型",
    "z_link_online": "本机链路在线",
    "z_host_online": "本机在线",
    "z_host_res": "本机资源",
    "z_host_res_ctrl": "本机资源 · 控制层",
    "z_host_res_garden": "本机资源 · 花园控制层",
    "z_host_name": "本机 AI 工作台",
    "z_sampling_short": "采样",
    "z_sampling_interval_note": "采样间隔 1.2s",
    "z_sampling_basis": "采样口径",
    "z_processor": "处理器",
    "z_bandwidth": "带宽",
    "z_no_active_req": "当前没有活动推理请求",
    "z_current_req": "当前推理请求",
    "z_current_live": "当前推理实时统计",
    "z_current_or_last": "当前请求或最近一次推理统计",
    "z_wait_backends": "等待 llama.cpp / LM Studio / Strata 加载模型",
    "z_wait_smi": "等待 nvidia-smi",
    "z_wait_smi_power": "等待 nvidia-smi 全卡功耗采样",
    "z_wait_sampling": "等待本机采样...",
    "z_wait_backend_load": "等待本机后端加载模型",
    "z_wait_token_detail": "等待后端返回 token 明细",
    "z_wait_new_req": "等待新的请求",
    "z_disk_read": "读 —",
    "z_disk_write": "写 —",
    "z_cached_dash": "缓存 —",
    "z_available_dash": "可用 —",
    "z_service_active": "服务 active",
    "z_overview": "概览",
    "z_total_token": "合计 TOKEN",
    "z_input_token": "输入 TOKEN",
    "z_output_token": "输出 TOKEN",
    "z_control_layer": "控制层",
    "z_source": "来源",
    "z_backend_metrics": "后端 metrics",
    "z_backend_offline": "后端未连接",
    "z_session_usage": "会话用量",
    "z_core_short": "核心",
    "z_physical_cores": "物理核心",
    "z_logic_threads": "逻辑线程",
    "z_threads_short": "线程",
    "z_task_manager": "任务管理器",
    "z_mem_total_ddr": "内存总量 · DDR 型号未识别",
    "z_mem_total_capacity": "内存总量 · 容量与占用",
    "z_hero_apple_a": "你的本机，",
    "z_hero_apple_b": "正在运行。",
    "z_hero_scroll_a": "运算如水，",
    "z_hero_scroll_b": "流转不息",
    "z_hero_oz_a": "算力成荫，",
    "z_hero_oz_b": "日日常青",
    "z_usage": "使用率",
    "z_used": "已使用",
    "z_task": "任务",
    "z_context_processing": "上下文处理中",
    "z_manual_refresh": "手动刷新采样快照",
    "z_manual_refresh_demo": "手动刷新演示快照",
    "z_all_disks_tm": "所有磁盘 · Task Manager",
    "z_not_detected": "未检测到",
    "z_backends_missing": "未检测到 llama.cpp / LM Studio / Strata",
    "z_backend_missing_short": "未检测到后端",
    "z_no_backend": "未检测到推理后端",
    "z_system": "系统",
    "z_gpu_short": "显卡",
    "z_normal": "正常",
    "z_clock_mhz": "主频 MHz",
    "z_updated": "最近更新",
    "z_recent": "最近",
    "z_last_inference": "最近一次推理统计",
    "z_gpu_array": "显卡阵列",
    "z_inference_info": "推理信息",
    "z_inference_short": "推理",
    "z_current_model": "当前模型",
    "z_interval": "刷新频率",
    "z_data_local": "数据仅在本机处理",
    "z_data_local_ctrl": "数据仅在本机处理 · NEXUS CONTROL LAYER",
    "z_data_local_garden": "数据仅在本机处理 · NEXUS GARDEN LAYER",
    "z_gpu_wait_all": "GPU：等待采样 · 主机：等待采样 · 推理后端：等待检测",
    "z_gpu_no_driver": "GPU：未检测到 GPU 驱动",
    "z_nvidia_all": "NVIDIA 全卡合计",
    "z_ram_used": "已占用",
    "z_total_usage": "总使用率",
    "z_seal_cpu": "核",
    "z_seal_ram": "藏",
    "z_seal_power": "爽",
    "z_title_native": "Local AI Workbench · 原生控制台",
    "z_title_apple": "本机 AI 工作台 · 极简原生",
    "z_title_cyberpunk": "NEXUS // 霓虹矩阵",
    "z_title_scroll": "NEXUS · 云水卷轴",
    "z_title_oz": "NEXUS · 绿野仙踪",
  };

  const EN = {
    "skin": "Theme",
    "skin_native": "Native Console",
    "skin_cyberpunk": "Neon Matrix",
    "skin_apple": "Minimal",
    "skin_scroll": "Cloud Scroll",
    "skin_oz": "Emerald Garden",
    "live": "Live",
    "refresh": "Refresh",
    "backend": "Backend",
    "auto": "Auto",
    "refresh_now": "Refresh now",
    "local_config": "Local config",
    "workbench": "Workbench",
    "overview": "Realtime Overview",
    "daily": "Daily Totals",
    "daily_wait": "Waiting for LM Studio logs",
    "daily_in": "Input Today",
    "daily_out": "Output Today",
    "daily_total": "Total Today",
    "prompt_tokens": "PROMPT TOKENS",
    "generated_tokens": "GENERATED TOKENS",
    "input_plus_output": "INPUT + OUTPUT",
    "current_instance": "Current Instance",
    "no_model": "[No model loaded]",
    "not_loaded": "Not loaded",
    "backend_name": "Backend",
    "not_connected": "Not connected",
    "arch": "Arch",
    "quant": "Quant",
    "context": "Context",
    "runtime": "Runtime",
    "pause": "Pause",
    "resume": "Resume",
    "gen_speed": "Gen Speed",
    "prompt_speed": "Prompt Speed",
    "context_used": "Context Usage",
    "total_power": "Total Power",
    "output": "OUTPUT",
    "prompt_eval": "PROMPT EVAL",
    "context_window": "CONTEXT WINDOW",
    "power_draw": "POWER DRAW",
    "avg": "Avg",
    "wait_metrics": "Waiting…",
    "wait_inference": "Waiting for inference",
    "realtime": "Live",
    "last_value": "Last value",
    "wait_lm_log": "Waiting for LM Studio logs",
    "wait_daily": "Waiting for daily totals",
    "daily_source": "Source",
    "requests_done": "completed requests",
    "today": "today",
    "gpu_devices": "GPUs",
    "gpu_note": "Per-card · 1.2s poll",
    "gpu_online": "ONLINE",
    "running_tasks": "Active Jobs",
    "task_note": "Queue & throughput",
    "clear_events": "Clear",
    "task_status": "Status",
    "task_title": "Title",
    "task_progress": "Progress",
    "task_pct": "%",
    "task_started": "Started",
    "task_eta": "ETA",
    "task_model": "Model",
    "generating": "Generating",
    "no_task": "No active job",
    "event_feed": "Events",
    "live_feed": "LIVE FEED",
    "pause_events": "Pause feed",
    "events_cleared": "Event feed cleared",
    "host_resources": "Host Resources",
    "system_note": "System-level sampling",
    "sampling": "Interval",
    "cpu": "CPU",
    "memory": "Memory",
    "disk": "Disk",
    "process": "Process",
    "no_inference_proc": "No inference process found",
    "sys_mem": "System Memory",
    "cached": "Cached",
    "available": "Available",
    "all_disks": "All Disks",
    "win_perf": "Windows Performance Counters",
    "read": "Read",
    "write": "Write",
    "task_mgr": "Task Manager",
    "task_mgr_total": "Task Manager total",
    "local_workbench": "LOCAL AI WORKBENCH",
    "data_source_demo": "Source: demo · probing local backends",
    "gpu_none": "No GPU detected",
    "gpu_none_note": "NVIDIA: install driver & verify nvidia-smi. AMD: install ROCm & verify rocm-smi.",
    "gpu_none_wait": "Waiting for nvidia-smi or rocm-smi",
    "gpu_util": "Utilization",
    "gpu_mem": "VRAM",
    "gpu_temp": "Temp",
    "gpu_power": "Power",
    "gpu_fan": "Fan",
    "gpu_clock": "Clock",
    "gpu_pstate": "P-State",
    "gpu_ecc": "ECC",
    "gpu_proc": "Process",
    "gpu_local": "Local GPU",
    "gpu_power_bus": "All GPUs",
    "gpu_valid": "valid",
    "gpu_not_detected": "No GPU driver found",
    "gpu_wait": "Waiting for GPU driver",
    "mem_gb": "GB",
    "ctx_tokens": "tokens",
    "batch": "Batch",
    "parallel": "Parallel",
    "flash_attn": "Flash Attn",
    "mtp": "MTP",
    "online": "Online",
    "idle": "Idle",
    "active_job": "ACTIVE JOB",
    "last_snapshot": "LAST SNAPSHOT",
    "live_task": "LIVE TASK",
    "local_backend": "Local backend",
    "wait_backend": "Waiting for backend",
    "wait_backend_info": "Waiting for local backend to report model info",
    "wait_backend_params": "Waiting for local backend to report model params",
    "detected_backend": "llama.cpp / LM Studio not detected",
    "model_loaded": "Model loaded",
    "model_not_loaded": "Not loaded",
    "gpu_array": "GPU ARRAY",
    "gpu_array_offline": "GPU ARRAY // OFFLINE",
    "gpu_code_online": "ONLINE",
    "core_util": "Core Util",
    "mem_usage": "VRAM Usage",
    "power_limit": "W",
    "nvidia_power_bus": "NVIDIA POWER BUS",
    "gpu_power_bus_en": "GPU POWER BUS",
    "valid": "VALID",
    "pci_acc": "PCIe ACCELERATOR",
    "p_state": "P-STATE",
    "device_status": "Device",
    "local_sampling": "Local sampling",
    "gpu_tag": "GPU",
    "gpu_count_online": "online",
    "ctx_occupied": "Usage",
    "ctx_remaining": "Remaining",
    "power_summary_wait": "Waiting for GPU driver",
    "nvidia_all_card": "nvidia-smi all GPUs",
    "rocm_all_card": "rocm-smi all GPUs",
    "all_card": "all GPUs",

    /* ---- shared labels for all five skins (used by the reverse lookup) ---- */
    "lang": "Language",
    "z_host_local": "Local processor",
    "z_local_model": "Local model",
    "z_local_model_alt": "Local inference model",
    "z_link_online": "Local link online",
    "z_host_online": "Local online",
    "z_host_res": "Local resources",
    "z_host_res_ctrl": "Local resources · Control",
    "z_host_res_garden": "Local resources · Garden",
    "z_host_name": "Local AI Workbench",
    "z_sampling_short": "Sampling",
    "z_sampling_interval_note": "Interval 1.2s",
    "z_sampling_basis": "Measured by",
    "z_processor": "Processor",
    "z_bandwidth": "Bandwidth",
    "z_no_active_req": "No active inference request",
    "z_current_req": "Current request",
    "z_current_live": "Live stats for this request",
    "z_current_or_last": "This request or the last inference",
    "z_wait_backends": "Waiting for llama.cpp / LM Studio / Strata",
    "z_wait_smi": "Waiting for nvidia-smi",
    "z_wait_smi_power": "Waiting for nvidia-smi power sampling",
    "z_wait_sampling": "Waiting for local sampling…",
    "z_wait_backend_load": "Waiting for a model to load",
    "z_wait_token_detail": "Waiting for token details",
    "z_wait_new_req": "Waiting for a new request",
    "z_disk_read": "Read —",
    "z_disk_write": "Write —",
    "z_cached_dash": "Cached —",
    "z_available_dash": "Available —",
    "z_service_active": "Service active",
    "z_overview": "Overview",
    "z_total_token": "TOTAL TOKENS",
    "z_input_token": "INPUT TOKENS",
    "z_output_token": "OUTPUT TOKENS",
    "z_control_layer": "Control",
    "z_source": "Source",
    "z_backend_metrics": "Backend metrics",
    "z_backend_offline": "Backend offline",
    "z_session_usage": "Session usage",
    "z_core_short": "Core",
    "z_physical_cores": "Cores",
    "z_logic_threads": "Threads",
    "z_threads_short": "Threads",
    "z_task_manager": "Task Manager",
    "z_mem_total_ddr": "Total memory · DDR type unknown",
    "z_mem_total_capacity": "Total memory · used and free",
    "z_hero_apple_a": "Your machine,",
    "z_hero_apple_b": "is running.",
    "z_hero_scroll_a": "Compute flows,",
    "z_hero_scroll_b": "and never stops",
    "z_hero_oz_a": "Compute grows,",
    "z_hero_oz_b": "ever green",
    "z_usage": "Usage",
    "z_used": "Used",
    "z_task": "Task",
    "z_context_processing": "Processing context",
    "z_manual_refresh": "Manual refresh: sampling snapshot",
    "z_manual_refresh_demo": "Manual refresh: demo snapshot",
    "z_all_disks_tm": "All disks · Task Manager",
    "z_not_detected": "Not detected",
    "z_backends_missing": "llama.cpp / LM Studio / Strata not detected",
    "z_backend_missing_short": "Backend not detected",
    "z_no_backend": "No inference backend detected",
    "z_system": "System",
    "z_gpu_short": "GPU",
    "z_normal": "Normal",
    "z_clock_mhz": "MHz",
    "z_updated": "Updated",
    "z_recent": "Recent",
    "z_last_inference": "Last inference",
    "z_gpu_array": "GPU array",
    "z_inference_info": "Inference",
    "z_inference_short": "Inference",
    "z_current_model": "Current model",
    "z_interval": "Interval",
    "z_data_local": "Processed locally only",
    "z_data_local_ctrl": "Processed locally only · NEXUS CONTROL LAYER",
    "z_data_local_garden": "Processed locally only · NEXUS GARDEN LAYER",
    "z_gpu_wait_all": "GPU: waiting · Host: waiting · Backend: detecting",
    "z_gpu_no_driver": "GPU: no GPU driver detected",
    "z_nvidia_all": "All NVIDIA GPUs",
    "z_ram_used": "Used",
    "z_total_usage": "Total usage",
    "z_seal_cpu": "C",
    "z_seal_ram": "R",
    "z_seal_power": "W",
    "z_title_native": "Local AI Workbench · Native Console",
    "z_title_apple": "Local AI Workbench · Minimal",
    "z_title_cyberpunk": "NEXUS // Neon Matrix",
    "z_title_scroll": "NEXUS · Cloud Scroll",
    "z_title_oz": "NEXUS · Emerald Garden",
  };

  let lang = localStorage.getItem('workbench-lang') || 'zh';

  function t(key) {
    const dict = lang === 'en' ? EN : ZH;
    return dict[key] || ZH[key] || key;
  }

  function apply() {
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      const translated = t(key);
      if (el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
      el.textContent = translated;
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
  }

  /* 语言下拉（#langSelect）与旧版按钮（#langToggle）都能切换 */
  function syncControls() {
    document.querySelectorAll('select#langSelect').forEach((select) => { select.value = lang; });
    const button = document.getElementById('langToggle');
    if (button) {
      button.textContent = lang === 'zh' ? 'EN' : '中';
      button.title = lang === 'zh' ? 'English' : '简体中文';
    }
  }

  /* 反查字典：页面上渲染出来的中文按值反查成英文；切回中文时用记录下来的原文还原。
     这样五套皮肤不用给每个标签加 data-i18n，改一处字典就能全站生效。 */
  const REVERSE = {};
  for (const [key, value] of Object.entries(ZH)) {
    if (typeof value === 'string' && !(value in REVERSE)) REVERSE[value] = EN[key] || value;
  }
  // 组合出来的文本（例如 "Strata · 已加载"）用后缀规则兜底
  const SUFFIX = [
    [' · 已加载', ' · loaded'],
    [' · 未加载模型', ' · not loaded'],
    [' · 未加载', ' · not loaded'],
    [' 在线', ' online'],
  ];

  function translate(text) {
    if (lang !== 'en' || typeof text !== 'string' || !text) return text;
    const key = text.trim();
    if (!key) return text;
    if (REVERSE[key]) return text.replace(key, REVERSE[key]);
    for (const [zh, en] of SUFFIX) {
      if (!key.endsWith(zh)) continue;
      const head = key.slice(0, -zh.length);
      return text.replace(key, (REVERSE[head] || head) + en);
    }
    return text;
  }

  function tr(text) { return translate(String(text)); }

  const originals = new WeakMap();
  const SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, PRE: 1, CODE: 1 };

  function walk(node) {
    if (node.nodeType === 3) {
      const current = node.nodeValue;
      if (!current || !current.trim()) return;
      let raw = originals.get(node);
      // 页面脚本直接改过这个文本节点时，以当前值作为新的原文
      if (raw === undefined || (current !== raw && current !== translate(raw))) {
        originals.set(node, current);
        raw = current;
      }
      const next = translate(raw);
      if (current !== next) node.nodeValue = next;
      return;
    }
    if (node.nodeType !== 1) return;
    // 带 data-i18n 的元素交给 apply() 管理，避免两边互相覆盖
    if (SKIP_TAGS[node.tagName] || node.hasAttribute('data-i18n') || node.hasAttribute('data-i18n-skip')) return;
    for (let child = node.firstChild; child; child = child.nextSibling) walk(child);
  }

  let originalTitle = null;
  function applyDom() {
    if (!document.body) return;
    walk(document.body);
    if (document.title) {
      if (originalTitle === null) originalTitle = document.title;
      const next = lang === 'en' ? translate(originalTitle) : originalTitle;
      if (document.title !== next) document.title = next;
    }
  }

  let scheduled = false;
  function scheduleDom() {
    if (scheduled) return;
    scheduled = true;
    const run = () => { scheduled = false; applyDom(); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
  }

  function watch() {
    if (!document.body || typeof MutationObserver !== 'function') return;
    new MutationObserver(scheduleDom).observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function setLang(newLang) {
    lang = newLang === 'en' ? 'en' : 'zh';
    try { localStorage.setItem('workbench-lang', lang); } catch (_) {}
    apply();
    applyDom();
    syncControls();
  }

  function toggle() {
    setLang(lang === 'zh' ? 'en' : 'zh');
  }

  function wireControls() {
    document.querySelectorAll('select#langSelect').forEach((select) => {
      if (select.dataset.i18nWired) return;
      select.dataset.i18nWired = '1';
      select.addEventListener('change', () => setLang(select.value));
    });
    const button = document.getElementById('langToggle');
    if (button && !button.dataset.i18nWired) {
      button.dataset.i18nWired = '1';
      button.addEventListener('click', toggle);
    }
    syncControls();
  }

  function start() {
    apply();
    applyDom();
    wireControls();
    watch();
  }

  window.i18n = { t, tr, translate, apply, applyDom, setLang, toggle, wireControls, start, get lang() { return lang; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}());
