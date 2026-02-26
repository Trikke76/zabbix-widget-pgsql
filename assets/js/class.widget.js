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
		if (!this._body) { return; }
		var root = this._body.querySelector('.js-pgdb-widget');
		if (!root) { return; }

		var icon = root.querySelector('.js-pgdb-icon');
		if (icon && icon.dataset.pngSrc && !icon.dataset.pngChecked) {
			icon.dataset.pngChecked = '1';
			var probe = new Image();
			probe.onload = function () { icon.src = icon.dataset.pngSrc; };
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

		if (!errorBox || !cards || !rings || !hostBox) { return; }

		try {
			this._renderInner(model, errorBox, cards, rings, hostBox, healthBox);
		} catch (e) {
			console.error('[PgsqlClusterWidget] _renderInner error:', e);
			errorBox.textContent = 'Widget render error: ' + e.message;
		}
	}

	// ── Health score berekening ──────────────────────────────────────────────
	// 6 categorieën, gewogen gemiddelde:
	//   Connectivity  25% — active_connections % van max
	//   Integriteit   20% — rollback ratio vs commits
	//   Stabiliteit   20% — idle_in_transaction + xid_age
	//   Efficiency    20% — cache hit + slow queries
	//   Replication   10% — replication_lag + wal_count
	//   Bloat          5% — bloating tables
	_calcHealth(clusterMetrics, dbMetrics) {
		function n(key, src) {
			var m = src ? src[key] : null;
			if (!m || m.value === null || m.value === '') return null;
			var v = Number(m.value);
			return isFinite(v) ? v : null;
		}

		var categories = [];

		// Connectivity (25%)
		var connPct = n('active_connections', clusterMetrics);
		var connScore = null;
		if (connPct !== null) {
			if (connPct <= 50)      connScore = 100;
			else if (connPct <= 80) connScore = 100 - ((connPct - 50) / 30) * 40;
			else                    connScore = 60  - ((connPct - 80) / 20) * 60;
			connScore = Math.max(0, connScore);
		}
		categories.push({ label: 'Connectivity', score: connScore, weight: 0.25,
			detail: connPct !== null ? connPct.toFixed(1) + '% conn. gebruik' : null });

		// Integriteit (20%)
		var commits   = n('commit_rate',   dbMetrics);
		var rollbacks = n('rollback_rate', dbMetrics);
		var integScore = null, rollbackPct = null;
		if (commits !== null && rollbacks !== null) {
			var total = commits + rollbacks;
			rollbackPct = total > 0 ? (rollbacks / total) * 100 : 0;
			if (rollbackPct <= 5)       integScore = 100 - (rollbackPct / 5) * 10;
			else if (rollbackPct <= 15) integScore = 90  - ((rollbackPct - 5)  / 10) * 30;
			else if (rollbackPct <= 30) integScore = 60  - ((rollbackPct - 15) / 15) * 60;
			else                        integScore = 0;
			integScore = Math.max(0, integScore);
		}
		categories.push({ label: 'Integriteit', score: integScore, weight: 0.20,
			detail: rollbackPct !== null
				? rollbacks.toFixed(1) + ' rollbacks / ' + commits.toFixed(1) + ' commits (' + rollbackPct.toFixed(1) + '%)'
				: null });

		// Stabiliteit (20%)
		var idle = n('idle_in_transaction', clusterMetrics);
		var xid  = n('xid_age', clusterMetrics);
		var idleScore = null, xidScore = null;
		if (idle !== null) {
			if (idle === 0)     idleScore = 100;
			else if (idle <= 1) idleScore = 80;
			else if (idle <= 3) idleScore = 50;
			else                idleScore = Math.max(0, 50 - (idle - 3) * 10);
		}
		if (xid !== null) {
			if (xid < 100000000)       xidScore = 100;
			else if (xid < 150000000)  xidScore = 100 - ((xid - 100000000) / 50000000) * 50;
			else                       xidScore = 0;
		}
		var stabilScore = null;
		if (idleScore !== null && xidScore !== null) stabilScore = (idleScore + xidScore) / 2;
		else if (idleScore !== null)                 stabilScore = idleScore;
		else if (xidScore  !== null)                 stabilScore = xidScore;
		var stabilDetail = [];
		if (idle !== null) stabilDetail.push(idle + ' idle-in-txn');
		if (xid  !== null) stabilDetail.push((xid / 1000000).toFixed(0) + 'M XID age');
		categories.push({ label: 'Stabiliteit', score: stabilScore, weight: 0.20,
			detail: stabilDetail.length ? stabilDetail.join(' · ') : null });

		// Efficiency (20%)
		var cacheHit = n('cache_hit',   clusterMetrics);
		var slowQ    = n('slow_queries', dbMetrics);
		var cacheScore = null, slowScore = null;
		if (cacheHit !== null) {
			if (cacheHit >= 100)     cacheScore = 100;
			else if (cacheHit >= 95) cacheScore = 80 + ((cacheHit - 95) / 5) * 20;
			else if (cacheHit >= 90) cacheScore = 50 + ((cacheHit - 90) / 5) * 30;
			else if (cacheHit >= 85) cacheScore = (cacheHit - 85) / 5 * 50;
			else                     cacheScore = 0;
		}
		if (slowQ !== null) {
			if (slowQ === 0)     slowScore = 100;
			else if (slowQ <= 2) slowScore = 80;
			else if (slowQ <= 5) slowScore = 60;
			else if (slowQ < 10) slowScore = 30;
			else                 slowScore = 0;
		}
		var effScore = null;
		if (cacheScore !== null && slowScore !== null) effScore = (cacheScore * 0.6) + (slowScore * 0.4);
		else if (cacheScore !== null)                  effScore = cacheScore;
		else if (slowScore  !== null)                  effScore = slowScore;
		var effDetail = [];
		if (cacheHit !== null) effDetail.push(cacheHit.toFixed(1) + '% cache hit');
		if (slowQ    !== null) effDetail.push(slowQ + ' slow queries');
		categories.push({ label: 'Efficiency', score: effScore, weight: 0.20,
			detail: effDetail.length ? effDetail.join(' · ') : null });

		// Replication (10%)
		var lag    = n('replication_lag', clusterMetrics);
		var walCnt = n('wal_count',       clusterMetrics);
		var lagScore = lag !== null
			? Math.max(0, lag === 0 ? 100 : lag <= 5 ? 100 - (lag/5)*20 : lag <= 30 ? 80 - ((lag-5)/25)*30 : lag <= 60 ? 50 - ((lag-30)/30)*50 : 0)
			: 100; // geen standby = niet van toepassing
		var walScore = null;
		if (walCnt !== null) {
			if (walCnt <= 50)       walScore = 100;
			else if (walCnt <= 100) walScore = 100 - ((walCnt - 50)  / 50)  * 20;
			else if (walCnt <= 300) walScore = 80  - ((walCnt - 100) / 200) * 50;
			else                    walScore = Math.max(0, 30 - ((walCnt - 300) / 100) * 30);
		}
		var replScore = walScore !== null ? (lagScore * 0.7) + (walScore * 0.3) : lagScore;
		var replDetail = [];
		replDetail.push(lag !== null ? lag + 's lag' : 'geen standby');
		if (walCnt !== null) replDetail.push(walCnt + ' WAL seg.');
		categories.push({ label: 'Replication', score: replScore, weight: 0.10,
			detail: replDetail.join(' · ') });

		// Bloat (5%)
		var bloat = n('bloat', dbMetrics);
		var bloatScore = null;
		if (bloat !== null) {
			if (bloat === 0)      bloatScore = 100;
			else if (bloat <= 2)  bloatScore = 85;
			else if (bloat <= 5)  bloatScore = 65;
			else if (bloat <= 10) bloatScore = 40;
			else                  bloatScore = 10;
		}
		categories.push({ label: 'Bloat', score: bloatScore, weight: 0.05,
			detail: bloat !== null ? bloat + ' bloating tables' : null });

		// Gewogen gemiddelde
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
			var s = cat.score !== null ? Math.round(cat.score) : null;
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

	_renderInner(model, errorBox, cards, rings, hostBox, healthBox) {
		errorBox.textContent = '';
		cards.innerHTML = '';
		rings.innerHTML = '';
		hostBox.innerHTML = '';
		if (healthBox) healthBox.innerHTML = '';

		if (model.error) { errorBox.textContent = model.error; return; }

		const metricDictionary = {
			active_connections: "Active connections as % of max_connections. Consistently above 80% risks saturation — consider connection pooling (PgBouncer) or raising max_connections carefully.",
			backends: "Active server processes for this database. High values can reflect workload; watch for many idle-in-transaction sessions or long-running queries.",
			db_size: "Total on-disk size of the database. Track growth trends and ensure disk/backup capacity keeps up.",
			wal_write: "WAL write rate on the primary. High values mean heavy write activity and can increase I/O pressure and checkpoint/WAL volume.",
			wal_receive: "WAL receive rate on a standby. Helps confirm the standby is streaming and keeping up with primary WAL traffic.",
			wal_count: "Number of WAL segments currently in pg_wal. Spikes can indicate slow archiving/replication, low max_wal_size, or a replication slot preventing removal.",
			temp_bytes_rate: "Temporary bytes written to disk (sort/hash spill). High values often mean work_mem is too low for query patterns or queries need optimization.",
			commit_rate: "Committed transactions per second. Useful as a throughput indicator; interpret alongside latency and resource usage.",
			rollback_rate: "Rolled-back transactions per second. Persistently high values often indicate application errors, retries, or serialization/deadlock handling.",
			locks_total: "Current number of locks. High counts are normal under load, but sudden spikes plus slow queries can indicate blocking/lock contention.",
			deadlocks_rate: "Deadlocks per time unit (circular waits). Any non-trivial rate suggests inconsistent lock ordering or conflicting transaction patterns.",
			slow_queries: "Queries exceeding the configured duration threshold. Use this to trigger investigation (EXPLAIN, indexing, query/plan changes).",
			cache_hit: "Buffer cache hit ratio (shared_buffers hits vs disk reads). Higher is generally better, but drops can be normal after restarts or with large working sets.",
			replication_lag: "Standby apply/receive lag in seconds vs primary. Sustained lag risks stale reads and longer failover catch-up.",
			bloat: "Estimated wasted space from updates/deletes. High bloat increases I/O and cache pressure; consider VACUUM tuning or REINDEX.",
			xid_age: "Age of the oldest transaction ID. CRITICAL: approaching ~2 billion risks transaction ID wraparound and forced read-only.",
			checkpoint_req: "Checkpoints triggered by WAL volume. Frequent checkpoints can cause I/O spikes; increase max_wal_size.",
			checkpoint_sch: "Time-based (scheduled) checkpoints. Tune checkpoint_timeout and checkpoint_completion_target to smooth I/O.",
			idle_in_transaction: "Connections in an open transaction without activity. Even one can block VACUUM and hold locks, causing cascading slowdowns.",
			checkpoint_write_time: "Average time (ms) writing data during a checkpoint. Spikes indicate storage I/O saturation."
		};

		var databases        = Array.isArray(model.databases) ? model.databases : [];
		var clusterMetrics   = model.cluster_metrics || {};
		var hostMetrics      = model.host_metrics || {};
		var visibleMetricKeys = new Set(Array.isArray(model.visible_metric_keys) ? model.visible_metric_keys : []);
		var visibleHostKeys   = new Set(Array.isArray(model.visible_host_metric_keys) ? model.visible_host_metric_keys : []);
		var zabbixBase  = (model.zabbix_base_url || '').replace(/\/$/, '');
		var graphPeriod = model.graph_period || '86400';
		var self = this;

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

		// ── Host metrics ──
		[
			{ key: 'host_cpu_load_avg1_key',    fallback: 'Host CPU load (avg1)' },
			{ key: 'host_cpu_load_avg5_key',    fallback: 'Host CPU load (avg5)' },
			{ key: 'host_cpu_load_avg15_key',   fallback: 'Host CPU load (avg15)' },
			{ key: 'host_memory_total_key',     fallback: 'Host memory total' },
			{ key: 'host_memory_available_key', fallback: 'Host memory available' }
		].forEach(function(spec) {
			if (visibleHostKeys.size > 0 && !visibleHostKeys.has(spec.key)) return;
			var metric = hostMetrics[spec.key] || null;
			var row = document.createElement('div');
			row.className = 'pgdb-widget__host-metric';
			if (spec.key === 'host_cpu_load_avg1_key' && metric) {
				var num = Number(metric.value);
				if (num >= Number(model.cpu_high_threshold || 2.0))      row.classList.add('is-cpu-high');
				else if (num >= Number(model.cpu_warn_threshold || 1.0)) row.classList.add('is-cpu-warn');
			}
			row.innerHTML =
				'<div class="pgdb-widget__host-metric-label">' + (metric ? metric.label : spec.fallback) + '</div>' +
				'<div class="pgdb-widget__host-metric-value">' + self._formatValue(metric ? metric.value : null, metric ? metric.units : null) + '</div>';
			row.appendChild(self._buildSparkline(metric && Array.isArray(metric.history) ? metric.history : []));
			hostBox.appendChild(makeClickable(row, metric ? metric.itemid : null));
		});

		// ── Database metrics ──
		var preferred = (model.default_db || '').trim();
		var selected  = databases.some(db => db.name === preferred) ? preferred : (databases[0] ? databases[0].name : '');

		var metricThemes = {
			active_connections:'blue', wal_write:'teal', wal_receive:'teal', wal_count:'teal',
			db_size:'green', backends:'blue', temp_bytes_rate:'purple', commit_rate:'green',
			rollback_rate:'orange', locks_total:'orange', deadlocks_rate:'red', slow_queries:'red',
			cache_hit:'green', replication_lag:'orange', bloat:'red', xid_age:'red',
			checkpoint_req:'orange', checkpoint_sch:'blue', idle_in_transaction:'orange', checkpoint_write_time:'orange'
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

			// Herbereken healthscore voor geselecteerde DB
			if (healthBox) {
				var health = self._calcHealth(clusterMetrics, db ? db.metrics : {});
				self._renderHealth(healthBox, health);
			}

			orderedMetrics.forEach(function(spec) {
				if (visibleMetricKeys.size > 0 && !visibleMetricKeys.has(spec.key)) return;
				var metric = spec.source === 'cluster' ? clusterMetrics[spec.key] : (db ? db.metrics[spec.key] : null);
				var card = document.createElement('div');
				card.className = 'pgdb-widget__card';
				card.setAttribute('data-theme', metricThemes[spec.key] || 'blue');
				var tip = metricDictionary[spec.key];
				if (tip) card.setAttribute('data-tooltip', tip);

				var extraHtml = '';
				if (spec.key === 'xid_age' && metric && metric.value !== null) {
					var xv = Number(metric.value);
					var xp = Math.min(100, (xv / 2000000000) * 100);
					var xc = xv >= 150000000 ? '#f44336' : xv >= 100000000 ? '#ff9800' : '#4caf50';
					card.setAttribute('data-theme', xv >= 150000000 ? 'red' : xv >= 100000000 ? 'orange' : 'green');
					extraHtml = '<div class="pgdb-widget__xid-bar"><div class="pgdb-widget__xid-bar-fill" style="width:' + xp.toFixed(1) + '%;background:' + xc + '"></div></div>';
				}

				card.innerHTML =
					'<div class="pgdb-widget__metric-title">' + spec.title + '</div>' +
					'<div class="pgdb-widget__metric-value">' + self._formatValue(metric ? metric.value : null, metric ? metric.units : null) + '</div>' +
					extraHtml;
				card.appendChild(self._buildSparkline(metric && Array.isArray(metric.history) ? metric.history : []));
				cards.appendChild(makeClickable(card, metric ? metric.itemid : null));
			});
		}

		function updateRings(activeDb) {
			rings.querySelectorAll('.pgdb-widget__ring').forEach(r =>
				r.classList.toggle('is-active', r.dataset.dbName === activeDb));
		}

		databases.forEach(function(db) {
			var li = document.createElement('li');
			li.className = 'pgdb-widget__ring';
			li.dataset.dbName = db.name;
			var btn = document.createElement('button');
			btn.className = 'pgdb-widget__ring-btn';
			btn.textContent = db.name;
			btn.onclick = function() { draw(db.name); };
			li.appendChild(btn);
			rings.appendChild(li);
		});

		if (selected) draw(selected);

		// Tooltip positie
		cards.addEventListener('mousemove', function(e) {
			var card = e.target.closest('.pgdb-widget__card');
			if (!card || !card.dataset.tooltip) return;
			var left = e.clientX + 10;
			if (left + 240 > window.innerWidth - 10) left = e.clientX - 250;
			if (left < 10) left = 10;
			var top = e.clientY - 80;
			if (top < 10) top = e.clientY + 10;
			card.style.setProperty('--tt-top', top + 'px');
			card.style.setProperty('--tt-left', left + 'px');
		});
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
