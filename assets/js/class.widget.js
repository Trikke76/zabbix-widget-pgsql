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

		var errorBox = root.querySelector('.js-pgdb-error');
		var cards = root.querySelector('.js-pgdb-cards');
		var rings = root.querySelector('.js-pgdb-rings');
		var hostBox = root.querySelector('.js-pgdb-host-metrics');

		if (!errorBox || !cards || !rings || !hostBox) { return; }

		try {
			this._renderInner(model, errorBox, cards, rings, hostBox);
		} catch (e) {
			console.error('[PgsqlClusterWidget] _renderInner error:', e);
			errorBox.textContent = 'Widget render error: ' + e.message;
		}
	}

	_renderInner(model, errorBox, cards, rings, hostBox) {
		errorBox.textContent = '';
		cards.innerHTML = '';
		rings.innerHTML = '';
		hostBox.innerHTML = '';

		if (model.error) { errorBox.textContent = model.error; return; }

		// Metric Dictionary voor Tooltips
		const metricDictionary = {
			active_connections: "Total number of established connections to the database cluster.",
			wal_write: "Rate of data written to the Write-Ahead Log. High values indicate heavy write activity.",
			wal_receive: "Rate of WAL data received from the primary (on standby nodes).",
			wal_count: "Number of WAL segments currently in the pg_wal directory.",
			db_size: "Total disk space occupied by the database files.",
			backends: "Number of active server processes for this specific database.",
			temp_bytes_rate: "Amount of temporary data written to disk (due to work_mem being too low for sorts/joins).",
			commit_rate: "Number of successful transactions per second.",
			rollback_rate: "Number of failed/aborted transactions per second. Keep this low.",
			locks_total: "Number of active locks. Excessive locking can indicate concurrency issues.",
			deadlocks_rate: "Frequency of deadlock situations where transactions block each other.",
			slow_queries: "Queries exceeding the defined execution time threshold.",
			cache_hit: "Percentage of data blocks found in shared buffers vs. read from disk. Ideal > 95%.",
			replication_lag: "Delay between the primary server and this standby in seconds.",
			bloat: "Estimated wasted space in tables/indexes caused by updates and deletes.",
			xid_age: "Age of the oldest transaction ID. If this hits 2 billion, the DB enters read-only mode!",
			checkpoint_req: "Checkpoints requested manually or by WAL volume. Too many indicate max_wal_size is too low.",
			checkpoint_sch: "Checkpoints occurring on a regular schedule (Time-based). This is the preferred way."
		};

		var databases = Array.isArray(model.databases) ? model.databases : [];
		var clusterMetrics = model.cluster_metrics || {};
		var hostMetrics = model.host_metrics || {};
		var visibleMetricKeys = new Set(Array.isArray(model.visible_metric_keys) ? model.visible_metric_keys : []);
		var visibleHostKeys = new Set(Array.isArray(model.visible_host_metric_keys) ? model.visible_host_metric_keys : []);

		var self = this;

		// ── Host metrics ──
		var hostOrdered = [
			{ key: 'host_cpu_load_avg1_key', fallback: 'Host CPU load (avg1)' },
			{ key: 'host_cpu_load_avg5_key', fallback: 'Host CPU load (avg5)' },
			{ key: 'host_cpu_load_avg15_key', fallback: 'Host CPU load (avg15)' },
			{ key: 'host_memory_total_key', fallback: 'Host memory total' },
			{ key: 'host_memory_available_key', fallback: 'Host memory available' }
		];

		hostOrdered.forEach(function (spec) {
			if (visibleHostKeys.size > 0 && !visibleHostKeys.has(spec.key)) { return; }
			var metric = hostMetrics[spec.key] || null;
			var row = document.createElement('div');
			row.className = 'pgdb-widget__host-metric';

			if (spec.key === 'host_cpu_load_avg1_key' && metric) {
				var cpuWarn = Number(model.cpu_warn_threshold || 1.0);
				var cpuHigh = Number(model.cpu_high_threshold || 2.0);
				var num = Number(metric.value);
				if (num >= cpuHigh) row.classList.add('is-cpu-high');
				else if (num >= cpuWarn) row.classList.add('is-cpu-warn');
			}

			row.innerHTML = `<div class="pgdb-widget__host-metric-label">${metric ? metric.label : spec.fallback}</div>
							 <div class="pgdb-widget__host-metric-value">${self._formatValue(metric ? metric.value : null, metric ? metric.units : null)}</div>`;

			var history = (metric && Array.isArray(metric.history)) ? metric.history : [];
			row.appendChild(self._buildSparkline(history));
			hostBox.appendChild(row);
		});

		// ── Database metrics ──
		var preferred = (model.default_db || '').trim();
		var selected = databases.some(db => db.name === preferred) ? preferred : databases[0].name;

		var metricThemes = {
			active_connections: 'blue', wal_write: 'teal', wal_receive: 'teal', wal_count: 'teal',
			db_size: 'green', backends: 'blue', temp_bytes_rate: 'purple', commit_rate: 'green',
			rollback_rate: 'orange', locks_total: 'orange', deadlocks_rate: 'red',
			slow_queries: 'red', cache_hit: 'green', replication_lag: 'orange', bloat: 'red',
			xid_age: 'red', checkpoint_req: 'orange', checkpoint_sch: 'blue'
		};

		var orderedMetrics = [
			{ key: 'active_connections', title: 'Active connections', source: 'cluster' },
			{ key: 'wal_write', title: 'WAL write/s', source: 'cluster' },
			{ key: 'db_size', title: 'Database size' },
			{ key: 'backends', title: 'Active connections (DB)' },
			{ key: 'temp_bytes_rate', title: 'Temp bytes/s' },
			{ key: 'commit_rate', title: 'Commits/s' },
			{ key: 'rollback_rate', title: 'Rollbacks/s' },
			{ key: 'locks_total', title: 'Locks total' },
			{ key: 'deadlocks_rate', title: 'Deadlocks/s' },
			{ key: 'slow_queries', title: 'Slow queries' },
			{ key: 'wal_receive', title: 'WAL receive/s', source: 'cluster' },
			{ key: 'wal_count', title: 'WAL segments', source: 'cluster' },
			{ key: 'cache_hit', title: 'Cache hit ratio', source: 'cluster' },
			{ key: 'replication_lag', title: 'Replication lag (s)', source: 'cluster' },
			{ key: 'bloat', title: 'Bloating tables' },
			{ key: 'xid_age', title: 'Oldest XID Age', source: 'cluster' },
			{ key: 'checkpoint_req', title: 'Checkpoint Req/s', source: 'cluster' },
			{ key: 'checkpoint_sch', title: 'Checkpoint Sch/s', source: 'cluster' }
		];

		function draw(dbName) {
			cards.innerHTML = '';
			var db = databases.find(d => d.name === dbName) || databases[0];
			updateRings(dbName);

			orderedMetrics.forEach(spec => {
				if (visibleMetricKeys.size > 0 && !visibleMetricKeys.has(spec.key)) return;
				var metric = spec.source === 'cluster' ? clusterMetrics[spec.key] : db.metrics[spec.key];
				var card = document.createElement('div');
				card.className = 'pgdb-widget__card';
				card.setAttribute('data-theme', metricThemes[spec.key] || 'blue');

				// Tooltip toevoegen
				card.setAttribute('title', metricDictionary[spec.key] || '');

				card.innerHTML = `<div class="pgdb-widget__metric-title">${spec.title}</div>
								  <div class="pgdb-widget__metric-value">${self._formatValue(metric ? metric.value : null, metric ? metric.units : null)}</div>`;

				var history = (metric && Array.isArray(metric.history)) ? metric.history : [];
				card.appendChild(self._buildSparkline(history));
				cards.appendChild(card);
			});
		}

		function updateRings(activeDb) {
			rings.querySelectorAll('.pgdb-widget__ring').forEach(r => r.classList.toggle('is-active', r.dataset.dbName === activeDb));
		}

		databases.forEach(db => {
			var li = document.createElement('li');
			li.className = 'pgdb-widget__ring';
			li.dataset.dbName = db.name;
			var btn = document.createElement('button');
			btn.className = 'pgdb-widget__ring-btn';
			btn.textContent = db.name;
			btn.onclick = () => draw(db.name);
			li.appendChild(btn);
			rings.appendChild(li);
		});

		draw(selected);
	}

	_buildSparkline(history) {
		var W = 200, H = 36;
		var pts = (history || []).map(Number).filter(isFinite);
		if (pts.length < 2) pts = [0, 0];

		var maxV = Math.max(...pts) || 1;
		var coords = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - ((v / maxV) * H)]);

		var d = `M ${coords[0][0].toFixed(2)},${coords[0][1].toFixed(2)}`;
		for (var i = 0; i < coords.length - 1; i++) {
			var p0 = coords[Math.max(i - 1, 0)], p1 = coords[i], p2 = coords[i + 1], p3 = coords[Math.min(i + 2, coords.length - 1)];
			var cp1x = p1[0] + (p2[0] - p0[0]) / 6, cp1y = p1[1] + (p2[1] - p0[1]) / 6;
			var cp2x = p2[0] - (p3[0] - p1[0]) / 6, cp2y = p2[1] - (p3[1] - p1[1]) / 6;
			d += ` C ${cp1x.toFixed(2)},${cp1y.toFixed(2)} ${cp2x.toFixed(2)},${cp2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
		}

		var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('class', 'pgdb-widget__sparkline');
		svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
		svg.setAttribute('preserveAspectRatio', 'none');

		svg.innerHTML = `
			<path class="spark-area" d="${d} L ${W},${H} L 0,${H} Z" fill="currentColor" />
			<path class="spark-line" d="${d}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
			<circle class="spark-dot" cx="${coords[coords.length-1][0]}" cy="${coords[coords.length-1][1]}" r="2" fill="currentColor" />
		`;
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
		var s = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0;
		var v = b;
		while (Math.abs(v) >= 1024 && i < s.length - 1) { v /= 1024; i++; }
		return v.toFixed(Math.abs(b) >= 1024 ? 2 : 0) + ' ' + s[i];
	}
};
