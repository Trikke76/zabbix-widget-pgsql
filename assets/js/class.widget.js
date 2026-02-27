window.CWidgetPgsqlCluster = class extends CWidget {
	onStart() {
		try { this._render(); }
		catch (e) { console.error('[PgsqlClusterWidget] onStart error:', e); }
	}

	processUpdateResponse(response) {
		super.processUpdateResponse(response);
		try { this._render(); }
		catch (e) { console.error('[PgsqlClusterWidget] processUpdateResponse error:', e); }
	}

	_render() {
		if (!this._body) return;
		var root = this._body.querySelector('.js-pgdb-widget');
		if (!root) return;

		var icon = root.querySelector('.js-pgdb-icon');
		if (icon && icon.dataset.pngSrc && !icon.dataset.pngChecked) {
			icon.dataset.pngChecked = '1';
			var probe = new Image();
			probe.onload = function() { icon.src = icon.dataset.pngSrc; };
			probe.src = icon.dataset.pngSrc;
		}

		var model = {};
		try { model = JSON.parse(root.dataset.model || '{}'); }
		catch (_e) { model = { error: 'Kan widget data niet lezen.' }; }

		var errorBox  = root.querySelector('.js-pgdb-error');
		var cards     = root.querySelector('.js-pgdb-cards');
		var rings     = root.querySelector('.js-pgdb-rings');
		var hostBox   = root.querySelector('.js-pgdb-host-metrics');
		var healthBox = root.querySelector('.js-pgdb-health');

		if (!errorBox || !cards || !rings || !hostBox) return;

		try {
			this._renderInner(model, errorBox, cards, rings, hostBox, healthBox, root);
		} catch (e) {
			console.error('[PgsqlClusterWidget] _renderInner error:', e);
			errorBox.textContent = 'Widget render error: ' + e.message;
		}
	}

	// ── Trend indicator ──────────────────────────────────────────────────────
	// Returns '↑' / '↓' / '→' based on last N history points
	_calcTrend(history) {
		var pts = (history || []).map(Number).filter(isFinite);
		if (pts.length < 4) return null;
		// Compare average of last third vs first third
		var third = Math.max(1, Math.floor(pts.length / 3));
		var early = pts.slice(0, third).reduce((a, b) => a + b, 0) / third;
		var late  = pts.slice(-third).reduce((a, b) => a + b, 0) / third;
		var diff  = early > 0 ? (late - early) / early : 0;
		if (diff > 0.05)  return { arrow: '↑', cls: 'trend-up' };
		if (diff < -0.05) return { arrow: '↓', cls: 'trend-down' };
		return { arrow: '→', cls: 'trend-stable' };
	}

	// ── Per-metric threshold coloring ────────────────────────────────────────
	// Returns 'warn' | 'crit' | null for known metrics
	_calcThreshold(key, value) {
		if (value === null || value === '') return null;
		var v = Number(value);
		if (!isFinite(v)) return null;

		var thresholds = {
			// [warn_value, crit_value, higher_is_worse]
			active_connections:    [50, 80,  true],
			rollback_rate:         [0.5, 2,  true],
			deadlocks_rate:        [0.1, 1,  true],
			slow_queries:          [1,   5,  true],
			replication_lag:       [10,  30, true],
			idle_in_transaction:   [1,   3,  true],
			bloat:                 [3,   8,  true],
			locks_total:           [50,  200,true],
			cache_hit:             [95,  90, false], // lower is worse
			xid_age:               [100000000, 150000000, true],
		};

		var t = thresholds[key];
		if (!t) return null;
		var [warn, crit, higher] = t;
		if (higher) {
			if (v >= crit) return 'crit';
			if (v >= warn) return 'warn';
		} else {
			if (v <= crit) return 'crit';
			if (v <= warn) return 'warn';
		}
		return null;
	}

	// ── Health score ─────────────────────────────────────────────────────────
	_calcHealth(clusterMetrics, dbMetrics, weights) {
		function n(key, src) {
			var m = src ? src[key] : null;
			if (!m || m.value === null || m.value === '') return null;
			var v = Number(m.value);
			return isFinite(v) ? v : null;
		}

		// Normalise weights so they always sum to 1 regardless of user input
		var w = {
			connectivity: Number(weights.connectivity || 25),
			integriteit:  Number(weights.integriteit  || 20),
			stabiliteit:  Number(weights.stabiliteit  || 20),
			efficiency:   Number(weights.efficiency   || 20),
			replication:  Number(weights.replication  || 10),
			bloat:        Number(weights.bloat        || 5),
		};
		var wSum = Object.values(w).reduce((a, b) => a + b, 0) || 100;
		Object.keys(w).forEach(k => w[k] = w[k] / wSum);

		var categories = [];

		// Connectivity
		var connPct = n('active_connections', clusterMetrics);
		var connScore = null;
		if (connPct !== null) {
			connScore = connPct <= 50 ? 100
				: connPct <= 80 ? 100 - ((connPct - 50) / 30) * 40
				: Math.max(0, 60 - ((connPct - 80) / 20) * 60);
		}
		categories.push({ label: 'Connectivity', score: connScore, weight: w.connectivity,
			detail: connPct !== null ? connPct.toFixed(1) + '% conn. gebruik' : null });

		// Integriteit
		var commits = n('commit_rate', dbMetrics), rollbacks = n('rollback_rate', dbMetrics);
		var integScore = null, rollbackPct = null;
		if (commits !== null && rollbacks !== null) {
			var total = commits + rollbacks;
			rollbackPct = total > 0 ? (rollbacks / total) * 100 : 0;
			integScore = rollbackPct <= 5  ? 100 - (rollbackPct / 5) * 10
				: rollbackPct <= 15 ? 90 - ((rollbackPct - 5)  / 10) * 30
				: rollbackPct <= 30 ? 60 - ((rollbackPct - 15) / 15) * 60
				: 0;
			integScore = Math.max(0, integScore);
		}
		categories.push({ label: 'Integriteit', score: integScore, weight: w.integriteit,
			detail: rollbackPct !== null
				? rollbacks.toFixed(1) + ' rb / ' + commits.toFixed(1) + ' commits (' + rollbackPct.toFixed(1) + '%)'
				: null });

		// Stabiliteit
		var idle = n('idle_in_transaction', clusterMetrics);
		var xid  = n('xid_age', clusterMetrics);
		var idleScore = idle !== null
			? (idle === 0 ? 100 : idle <= 1 ? 80 : idle <= 3 ? 50 : Math.max(0, 50 - (idle - 3) * 10))
			: null;
		var xidScore = xid !== null
			? (xid < 100000000 ? 100 : xid < 150000000 ? 100 - ((xid - 100000000) / 50000000) * 50 : 0)
			: null;
		var stabilScore = (idleScore !== null && xidScore !== null) ? (idleScore + xidScore) / 2
			: idleScore !== null ? idleScore : xidScore;
		var stabilDetail = [];
		if (idle !== null) stabilDetail.push(idle + ' idle-in-txn');
		if (xid  !== null) stabilDetail.push((xid / 1000000).toFixed(0) + 'M XID age');
		categories.push({ label: 'Stabiliteit', score: stabilScore, weight: w.stabiliteit,
			detail: stabilDetail.length ? stabilDetail.join(' · ') : null });

		// Efficiency
		var cacheHit = n('cache_hit', clusterMetrics), slowQ = n('slow_queries', dbMetrics);
		var cacheScore = cacheHit !== null
			? (cacheHit >= 100 ? 100 : cacheHit >= 95 ? 80 + ((cacheHit - 95) / 5) * 20
				: cacheHit >= 90 ? 50 + ((cacheHit - 90) / 5) * 30
				: cacheHit >= 85 ? (cacheHit - 85) / 5 * 50 : 0)
			: null;
		var slowScore = slowQ !== null
			? (slowQ === 0 ? 100 : slowQ <= 2 ? 80 : slowQ <= 5 ? 60 : slowQ < 10 ? 30 : 0)
			: null;
		var effScore = (cacheScore !== null && slowScore !== null) ? (cacheScore * 0.6) + (slowScore * 0.4)
			: cacheScore !== null ? cacheScore : slowScore;
		var effDetail = [];
		if (cacheHit !== null) effDetail.push(cacheHit.toFixed(1) + '% cache hit');
		if (slowQ    !== null) effDetail.push(slowQ + ' slow queries');
		categories.push({ label: 'Efficiency', score: effScore, weight: w.efficiency,
			detail: effDetail.length ? effDetail.join(' · ') : null });

		// Replication
		var lag    = n('replication_lag', clusterMetrics);
		var walCnt = n('wal_count', clusterMetrics);
		var lagScore = lag !== null
			? Math.max(0, lag === 0 ? 100 : lag <= 5 ? 100 - (lag/5)*20
				: lag <= 30 ? 80 - ((lag-5)/25)*30 : lag <= 60 ? 50 - ((lag-30)/30)*50 : 0)
			: 100;
		var walScore = walCnt !== null
			? (walCnt <= 50 ? 100 : walCnt <= 100 ? 100 - ((walCnt-50)/50)*20
				: walCnt <= 300 ? 80 - ((walCnt-100)/200)*50 : Math.max(0, 30 - ((walCnt-300)/100)*30))
			: null;
		var replScore = walScore !== null ? (lagScore * 0.7) + (walScore * 0.3) : lagScore;
		var replDetail = [];
		replDetail.push(lag !== null ? lag + 's lag' : 'geen standby');
		if (walCnt !== null) replDetail.push(walCnt + ' WAL seg.');
		categories.push({ label: 'Replication', score: replScore, weight: w.replication,
			detail: replDetail.join(' · ') });

		// Bloat
		var bloat = n('bloat', dbMetrics);
		var bloatScore = bloat !== null
			? (bloat === 0 ? 100 : bloat <= 2 ? 85 : bloat <= 5 ? 65 : bloat <= 10 ? 40 : 10)
			: null;
		categories.push({ label: 'Bloat', score: bloatScore, weight: w.bloat,
			detail: bloat !== null ? bloat + ' bloating tables' : null });

		// Weighted average
		var totalWeight = 0, weightedSum = 0;
		categories.forEach(function(cat) {
			if (cat.score !== null) { weightedSum += cat.score * cat.weight; totalWeight += cat.weight; }
		});
		return { total: totalWeight > 0 ? Math.round(weightedSum / totalWeight) : null, categories: categories };
	}

	_renderHealth(healthBox, health) {
		if (!healthBox || !health || health.total === null) return;
		var score = health.total;
		var color = score >= 90 ? '#4caf50' : score >= 70 ? '#ff9800' : '#f44336';
		var label = score >= 90 ? 'Excellent' : score >= 70 ? 'Let op' : 'Kritiek';

		var tipLines = health.categories.map(function(cat) {
			var s = cat.score !== null ? Math.round(cat.score) + '/100' : 'n/a';
			return cat.label + ': ' + s + (cat.detail ? ' — ' + cat.detail : '');
		});

		healthBox.innerHTML = '';
		healthBox.setAttribute('title', tipLines.join('\n'));

		var titleEl = document.createElement('div');
		titleEl.className = 'pgdb-widget__health-title';
		titleEl.textContent = 'Health';

		var scoreEl = document.createElement('div');
		scoreEl.className = 'pgdb-widget__health-score';
		scoreEl.style.color = color;
		scoreEl.textContent = score + '%';

		var labelEl = document.createElement('div');
		labelEl.className = 'pgdb-widget__health-label';
		labelEl.style.color = color;
		labelEl.textContent = label;

		var catsEl = document.createElement('div');
		catsEl.className = 'pgdb-widget__health-cats';
		health.categories.forEach(function(cat) {
			var s  = cat.score !== null ? Math.round(cat.score) : null;
			var bc = s === null ? '#444' : s >= 90 ? '#4caf50' : s >= 70 ? '#ff9800' : '#f44336';
			var row = document.createElement('div');
			row.className = 'pgdb-widget__health-cat';
			row.innerHTML =
				'<span class="pgdb-widget__health-cat-label">' + cat.label + '</span>' +
				'<div class="pgdb-widget__health-cat-bar">' +
					'<div class="pgdb-widget__health-cat-fill" style="width:' + (s !== null ? s : 0) + '%;background:' + bc + '"></div>' +
				'</div>' +
				'<span class="pgdb-widget__health-cat-score" style="color:' + bc + '">' + (s !== null ? s : '—') + '</span>';
			catsEl.appendChild(row);
		});

		healthBox.appendChild(titleEl);
		healthBox.appendChild(scoreEl);
		healthBox.appendChild(labelEl);
		healthBox.appendChild(catsEl);
	}

	_renderInner(model, errorBox, cards, rings, hostBox, healthBox, root) {
		errorBox.textContent = '';
		cards.innerHTML  = '';
		rings.innerHTML  = '';
		hostBox.innerHTML = '';
		if (healthBox) healthBox.innerHTML = '';

		if (model.error) { errorBox.textContent = model.error; return; }

		const metricDictionary = {
			active_connections:    "Active connections as % of max_connections. Above 80% risks saturation — consider PgBouncer.",
			backends:              "Active server processes for this database. Watch for idle-in-transaction sessions or long-running queries.",
			db_size:               "Total on-disk size of the database. Track growth trends and ensure disk/backup capacity keeps up.",
			wal_write:             "WAL write rate on the primary. High values mean heavy write activity and increased I/O pressure.",
			wal_receive:           "WAL receive rate on a standby. Confirms the standby is streaming and keeping up with primary WAL traffic.",
			wal_count:             "Number of WAL segments in pg_wal. Spikes indicate slow archiving, low max_wal_size, or a blocking replication slot.",
			temp_bytes_rate:       "Temporary bytes written to disk (sort/hash spill). High values mean work_mem is too low or queries need optimization.",
			commit_rate:           "Committed transactions per second. A throughput indicator — interpret alongside latency and resource usage.",
			rollback_rate:         "Rolled-back transactions per second. High values indicate application errors, retries, or serialization conflicts.",
			locks_total:           "Current number of locks. Sudden spikes plus slow queries can indicate blocking/lock contention.",
			deadlocks_rate:        "Deadlocks per time unit. Any non-trivial rate suggests inconsistent lock ordering or conflicting transactions.",
			slow_queries:          "Queries exceeding the configured duration threshold. Triggers investigation via EXPLAIN, indexing, or query changes.",
			cache_hit:             "Buffer cache hit ratio. Higher is better; drops can be normal after restarts or with large working sets.",
			replication_lag:       "Standby apply/receive lag in seconds. Sustained lag risks stale reads and longer failover catch-up.",
			bloat:                 "Estimated wasted space from updates/deletes. High bloat increases I/O — consider VACUUM tuning or REINDEX.",
			xid_age:               "Age of the oldest transaction ID. CRITICAL: approaching ~2 billion risks transaction ID wraparound and forced read-only.",
			checkpoint_req:        "Checkpoints triggered by WAL volume. Frequent checkpoints cause I/O spikes — increase max_wal_size.",
			checkpoint_sch:        "Time-based checkpoints. Tune checkpoint_timeout and checkpoint_completion_target to smooth I/O.",
			idle_in_transaction:   "Connections in an open transaction without activity. Even one can block VACUUM and hold locks indefinitely.",
			checkpoint_write_time: "Average ms writing data during a checkpoint. Spikes indicate storage I/O saturation."
		};

		var databases         = Array.isArray(model.databases) ? model.databases : [];
		var clusterMetrics    = model.cluster_metrics || {};
		var hostMetrics       = model.host_metrics || {};
		var visibleMetricKeys = new Set(Array.isArray(model.visible_metric_keys) ? model.visible_metric_keys : []);
		var visibleHostKeys   = new Set(Array.isArray(model.visible_host_metric_keys) ? model.visible_host_metric_keys : []);
		var healthWeights     = model.health_weights || {};
		var zabbixBase        = (model.zabbix_base_url || '').replace(/\/$/, '');
		var graphPeriod       = model.graph_period || '86400';
		var self              = this;

		function zabbixGraphUrl(itemid) {
			if (!itemid || !zabbixBase) return null;
			return zabbixBase + '/history.php?action=showgraph&itemids[]=' + itemid + '&from=now-' + graphPeriod + 's&to=now';
		}

		function makeClickable(el, itemid) {
			var url = zabbixGraphUrl(itemid);
			if (!url) return el;
			var a = document.createElement('a');
			a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
			a.className = 'pgdb-widget__card-link';
			a.appendChild(el);
			return a;
		}

		// ── Host metrics ──────────────────────────────────────────────────────
		[
			{ key: 'host_cpu_load_avg1_key',    fallback: 'Host CPU load (avg1)' },
			{ key: 'host_cpu_load_avg5_key',    fallback: 'Host CPU load (avg5)' },
			{ key: 'host_cpu_load_avg15_key',   fallback: 'Host CPU load (avg15)' },
			{ key: 'host_memory_total_key',     fallback: 'Host memory total' },
			{ key: 'host_memory_available_key', fallback: 'Host memory available' }
		].forEach(function(spec) {
			if (visibleHostKeys.size > 0 && !visibleHostKeys.has(spec.key)) return;
			var metric  = hostMetrics[spec.key] || null;
			var row     = document.createElement('div');
			row.className = 'pgdb-widget__host-metric';

			if (spec.key === 'host_cpu_load_avg1_key' && metric) {
				var num = Number(metric.value);
				if (num >= Number(model.cpu_high_threshold || 2.0))      row.classList.add('is-cpu-high');
				else if (num >= Number(model.cpu_warn_threshold || 1.0)) row.classList.add('is-cpu-warn');
			}

			var history = metric && Array.isArray(metric.history) ? metric.history : [];
			var trend   = self._calcTrend(history);

			row.innerHTML =
				'<div class="pgdb-widget__host-metric-label">' + (metric ? metric.label : spec.fallback) +
					(trend ? ' <span class="pgdb-trend ' + trend.cls + '">' + trend.arrow + '</span>' : '') +
				'</div>' +
				'<div class="pgdb-widget__host-metric-value">' + self._formatValue(metric ? metric.value : null, metric ? metric.units : null) + '</div>';

			row.appendChild(self._buildSparkline(history));

			// Alert badge
			if (metric && metric.problem) {
				var badge = document.createElement('span');
				badge.className = 'pgdb-widget__alert-badge';
				badge.style.background = metric.problem.color;
				badge.title = metric.problem.label + ': ' + metric.problem.name;
				row.appendChild(badge);
			}

			hostBox.appendChild(makeClickable(row, metric ? metric.itemid : null));
		});

		// ── Database selector & metrics ───────────────────────────────────────
		var preferred = (model.default_db || '').trim();
		var selected  = databases.some(db => db.name === preferred) ? preferred : (databases[0] ? databases[0].name : '');

		var metricThemes = {
			active_connections:'blue',  wal_write:'teal',     wal_receive:'teal',    wal_count:'teal',
			db_size:'green',            backends:'blue',       temp_bytes_rate:'purple', commit_rate:'green',
			rollback_rate:'orange',     locks_total:'orange',  deadlocks_rate:'red',  slow_queries:'red',
			cache_hit:'green',          replication_lag:'orange', bloat:'red',        xid_age:'red',
			checkpoint_req:'orange',    checkpoint_sch:'blue', idle_in_transaction:'orange', checkpoint_write_time:'orange'
		};

		var orderedMetrics = [
			{ key:'active_connections',    title:'Active conn. %',        source:'cluster' },
			{ key:'wal_write',             title:'WAL write/s',           source:'cluster' },
			{ key:'db_size',               title:'Database size' },
			{ key:'backends',              title:'Active connections (DB)' },
			{ key:'temp_bytes_rate',       title:'Temp bytes/s' },
			{ key:'commit_rate',           title:'Commits/s' },
			{ key:'rollback_rate',         title:'Rollbacks/s' },
			{ key:'locks_total',           title:'Locks total' },
			{ key:'deadlocks_rate',        title:'Deadlocks/s' },
			{ key:'slow_queries',          title:'Slow queries' },
			{ key:'wal_receive',           title:'WAL receive/s',         source:'cluster' },
			{ key:'wal_count',             title:'WAL segments',          source:'cluster' },
			{ key:'cache_hit',             title:'Cache hit ratio',       source:'cluster' },
			{ key:'replication_lag',       title:'Replication lag (s)',   source:'cluster' },
			{ key:'bloat',                 title:'Bloating tables' },
			{ key:'xid_age',               title:'Oldest XID Age',        source:'cluster' },
			{ key:'checkpoint_req',        title:'Checkpoint Req/s',      source:'cluster' },
			{ key:'checkpoint_sch',        title:'Checkpoint Sch/s',      source:'cluster' },
			{ key:'idle_in_transaction',   title:'Idle in transaction',   source:'cluster' },
			{ key:'checkpoint_write_time', title:'Checkpoint write (ms)', source:'cluster' }
		];

		function draw(dbName) {
			cards.innerHTML = '';
			var db = databases.find(d => d.name === dbName) || databases[0];
			updateRings(dbName);

			if (healthBox) {
				var health = self._calcHealth(clusterMetrics, db ? db.metrics : {}, healthWeights);
				self._renderHealth(healthBox, health);
			}

			orderedMetrics.forEach(function(spec, idx) {
				if (visibleMetricKeys.size > 0 && !visibleMetricKeys.has(spec.key)) return;
				var metric = spec.source === 'cluster' ? clusterMetrics[spec.key] : (db ? db.metrics[spec.key] : null);

				var card = document.createElement('div');
				card.className = 'pgdb-widget__card pgdb-anim';
				card.style.animationDelay = (idx * 30) + 'ms'; // stagger
				card.setAttribute('data-theme', metricThemes[spec.key] || 'blue');

				// Threshold override theme
				var threshold = self._calcThreshold(spec.key, metric ? metric.value : null);
				if (threshold === 'crit') card.setAttribute('data-threshold', 'crit');
				else if (threshold === 'warn') card.setAttribute('data-threshold', 'warn');

				var tip = metricDictionary[spec.key];
				if (tip) card.setAttribute('data-tooltip', tip);

				// XID Age progress bar
				var extraHtml = '';
				if (spec.key === 'xid_age' && metric && metric.value !== null) {
					var xv = Number(metric.value);
					var xp = Math.min(100, (xv / 2000000000) * 100);
					var xc = xv >= 150000000 ? '#f44336' : xv >= 100000000 ? '#ff9800' : '#4caf50';
					card.setAttribute('data-theme', xv >= 150000000 ? 'red' : xv >= 100000000 ? 'orange' : 'green');
					extraHtml = '<div class="pgdb-widget__xid-bar"><div class="pgdb-widget__xid-bar-fill" style="width:' + xp.toFixed(1) + '%;background:' + xc + '"></div></div>';
				}

				// Trend indicator
				var history = metric && Array.isArray(metric.history) ? metric.history : [];
				var trend   = self._calcTrend(history);
				var trendHtml = trend
					? '<span class="pgdb-trend ' + trend.cls + '">' + trend.arrow + '</span>'
					: '';

				card.innerHTML =
					'<div class="pgdb-widget__metric-title">' + spec.title + trendHtml + '</div>' +
					'<div class="pgdb-widget__metric-value">' + self._formatValue(metric ? metric.value : null, metric ? metric.units : null) + '</div>' +
					extraHtml;

				card.appendChild(self._buildSparkline(history));

				// Alert badge (problem from Zabbix trigger)
				if (metric && metric.problem) {
					var badge = document.createElement('span');
					badge.className = 'pgdb-widget__alert-badge';
					badge.style.background = metric.problem.color;
					badge.title = metric.problem.label + ': ' + metric.problem.name;
					card.appendChild(badge);
				}

				cards.appendChild(makeClickable(card, metric ? metric.itemid : null));
			});
		}

		function updateRings(activeDb) {
			rings.querySelectorAll('.pgdb-widget__ring').forEach(r =>
				r.classList.toggle('is-active', r.dataset.dbName === activeDb));
		}

		databases.forEach(function(db) {
			var li  = document.createElement('li');
			li.className = 'pgdb-widget__ring';
			li.dataset.dbName = db.name;
			var btn = document.createElement('button');
			btn.className   = 'pgdb-widget__ring-btn';
			btn.textContent = db.name;
			btn.onclick = function() { draw(db.name); };
			li.appendChild(btn);
			rings.appendChild(li);
		});

		if (selected) draw(selected);

		// ── Tooltip setup: only attach once per root element ─────────────────
		if (!root.dataset.tooltipInit) {
			root.dataset.tooltipInit = '1';

			var tip = document.createElement('div');
			tip.id = 'pgdb-tooltip-' + Date.now();
			tip.style.cssText = [
				'position:fixed',
				'background:#1a2330',
				'color:#e8edf2',
				'font-size:11px',
				'font-weight:400',
				'line-height:1.5',
				'padding:7px 10px',
				'border-radius:6px',
				'border:1px solid rgba(255,255,255,0.12)',
				'width:240px',
				'white-space:normal',
				'box-shadow:0 4px 12px rgba(0,0,0,0.35)',
				'pointer-events:none',
				'z-index:99999',
				'font-family:Segoe UI,system-ui,sans-serif',
				'opacity:0',
				'transition:opacity 0.12s ease',
				'top:0',
				'left:0',
			].join(';');
			document.body.appendChild(tip);

			// Clean up tooltip when widget root is removed from DOM
			var observer = new MutationObserver(function() {
				if (!document.body.contains(root)) {
					tip.remove();
					observer.disconnect();
				}
			});
			observer.observe(document.body, { childList: true, subtree: true });

			root.addEventListener('mouseover', function(e) {
				var card = e.target.closest('[data-tooltip]');
				if (!card) return;
				tip.textContent = card.dataset.tooltip;
				tip.style.opacity = '1';
			});

			root.addEventListener('mouseout', function(e) {
				var card = e.target.closest('[data-tooltip]');
				if (!card) return;
				tip.style.opacity = '0';
			});

			root.addEventListener('mousemove', function(e) {
				if (tip.style.opacity === '0') return;

				var margin = 14;
				var tipW   = 250; // slightly wider than rendered to avoid wrapping flicker
				var tipH   = tip.offsetHeight || 80;

				// Use clientWidth/Height of documentElement — works inside Zabbix iframes too
				var vw = document.documentElement.clientWidth;
				var vh = document.documentElement.clientHeight;

				// Prefer above cursor
				var top = e.clientY - tipH - margin;
				if (top < margin) top = e.clientY + margin + 4;
				// Clamp to viewport bottom
				if (top + tipH > vh - margin) top = vh - tipH - margin;

				// Prefer right of cursor
				var left = e.clientX + margin;
				if (left + tipW > vw - margin) left = e.clientX - tipW - margin;
				if (left < margin) left = margin;

				tip.style.top  = top  + 'px';
				tip.style.left = left + 'px';
			});
		}
	}

	_buildSparkline(history) {
		var W = 200, H = 36;
		var pts = (history || []).map(Number).filter(isFinite);
		if (pts.length < 2) pts = [0, 0];
		var maxV = Math.max(...pts) || 1;
		var coords = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - ((v / maxV) * H)]);
		var d = 'M ' + coords[0][0].toFixed(2) + ',' + coords[0][1].toFixed(2);
		for (var i = 0; i < coords.length - 1; i++) {
			var p0 = coords[Math.max(i-1,0)], p1 = coords[i], p2 = coords[i+1], p3 = coords[Math.min(i+2,coords.length-1)];
			var cp1x = p1[0]+(p2[0]-p0[0])/6, cp1y = p1[1]+(p2[1]-p0[1])/6;
			var cp2x = p2[0]-(p3[0]-p1[0])/6, cp2y = p2[1]-(p3[1]-p1[1])/6;
			d += ' C '+cp1x.toFixed(2)+','+cp1y.toFixed(2)+' '+cp2x.toFixed(2)+','+cp2y.toFixed(2)+' '+p2[0].toFixed(2)+','+p2[1].toFixed(2);
		}
		var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('class', 'pgdb-widget__sparkline');
		svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
		svg.setAttribute('preserveAspectRatio', 'none');
		svg.innerHTML =
			'<path class="spark-area" d="' + d + ' L ' + W + ',' + H + ' L 0,' + H + ' Z" fill="currentColor"/>' +
			'<path class="spark-line" d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
			'<circle class="spark-dot" cx="' + coords[coords.length-1][0] + '" cy="' + coords[coords.length-1][1] + '" r="2" fill="currentColor"/>';
		return svg;
	}

	_formatValue(v, u) {
		if (v == null || v === '') return 'n/a';
		var n = Number(v);
		if (isNaN(n)) return String(v);
		if (u === 'B') return this._formatBytes(n);
		return n.toLocaleString() + (u ? ' ' + u : '');
	}

	_formatBytes(b) {
		var s = ['B','KB','MB','GB','TB'], i = 0, v = b;
		while (Math.abs(v) >= 1024 && i < s.length-1) { v /= 1024; i++; }
		return v.toFixed(Math.abs(b) >= 1024 ? 2 : 0) + ' ' + s[i];
	}
};
