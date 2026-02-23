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

		var icon = root.querySelector('.pgdb-widget__icon');
		if (icon && !icon.dataset.errorHandled) {
			icon.dataset.errorHandled = '1';
			icon.onerror = function() {
				var fallback = icon.dataset.fallbackSrc;
				if (fallback && icon.getAttribute('src') !== fallback) {
					icon.setAttribute('src', fallback);
				}
			};
		}

		var model = {};
		try {
			model = JSON.parse(root.dataset.model || '{}');
		} catch (_e) {
			model = {error: 'Kan widget data niet lezen.'};
		}

		var errorBox = root.querySelector('.js-pgdb-error');
		var cards    = root.querySelector('.js-pgdb-cards');
		var rings    = root.querySelector('.js-pgdb-rings');
		var hostBox  = root.querySelector('.js-pgdb-host-metrics');

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
		cards.innerHTML     = '';
		rings.innerHTML     = '';
		hostBox.innerHTML   = '';

		if (model.error) { errorBox.textContent = model.error; return; }

		var databases          = Array.isArray(model.databases) ? model.databases : [];
		var clusterMetrics     = model.cluster_metrics  || {};
		var hostMetrics        = model.host_metrics     || {};
		var visibility         = model.visibility       || {};
		var visibleMetricKeys  = new Set(Array.isArray(model.visible_metric_keys)      ? model.visible_metric_keys      : []);
		var visibleHostKeys    = new Set(Array.isArray(model.visible_host_metric_keys) ? model.visible_host_metric_keys : []);
		var cpuWarn            = Number(model.cpu_warn_threshold != null ? model.cpu_warn_threshold : 1.0);
		var cpuHigh            = Number(model.cpu_high_threshold != null ? model.cpu_high_threshold : 2.0);

		if (databases.length === 0) {
			errorBox.textContent = 'No databases found. Check the discovery item.';
			return;
		}

		var self = this;

		function isHidden(key) {
			return Object.prototype.hasOwnProperty.call(visibility, key) && !Boolean(Number(visibility[key]));
		}
		function isMetricVisible(mKey, vKey) {
			return visibleMetricKeys.size > 0 ? visibleMetricKeys.has(mKey) : !isHidden(vKey);
		}
		function isHostVisible(mKey, vKey) {
			return visibleHostKeys.size > 0 ? visibleHostKeys.has(mKey) : !isHidden(vKey);
		}

		// ── Host metrics ────────────────────────────────────────────────
		var hostOrdered = [
			{key: 'host_cpu_load_avg1_key',    fallback: 'Host CPU load (avg1)',  visible: 'show_host_cpu_avg1'},
			{key: 'host_cpu_load_avg5_key',    fallback: 'Host CPU load (avg5)',  visible: 'show_host_cpu_avg5'},
			{key: 'host_cpu_load_avg15_key',   fallback: 'Host CPU load (avg15)', visible: 'show_host_cpu_avg15'},
			{key: 'host_memory_total_key',     fallback: 'Host memory total',     visible: 'show_host_mem_total'},
			{key: 'host_memory_available_key', fallback: 'Host memory available', visible: 'show_host_mem_available'}
		];

		hostOrdered.forEach(function(spec) {
			if (!isHostVisible(spec.key, spec.visible)) { return; }
			var metric = hostMetrics[spec.key] || null;
			var row = document.createElement('div');
			row.className = 'pgdb-widget__host-metric';

			var lbl = document.createElement('div');
			lbl.className = 'pgdb-widget__host-metric-label';
			lbl.textContent = metric ? metric.label : spec.fallback;

			var val = document.createElement('div');
			val.className = 'pgdb-widget__host-metric-value';
			val.textContent = self._formatValue(metric ? metric.value : null, metric ? metric.units : null);

			if (spec.key === 'host_cpu_load_avg1_key') {
				var num = Number(metric ? metric.value : null);
				if (!isNaN(num)) {
					if (num >= cpuHigh) { row.classList.add('is-cpu-high'); }
					else if (num >= cpuWarn) { row.classList.add('is-cpu-warn'); }
				}
			}

			row.appendChild(lbl);
			row.appendChild(val);

			try {
				var historyPts = (metric && Array.isArray(metric.history) && metric.history.length > 1)
					? metric.history : null;
				var svg = self._buildSparkline(historyPts, metric ? metric.value : null);
				row.appendChild(svg);
			} catch (sparkErr) {
				console.warn('[PgsqlClusterWidget] host sparkline failed for', spec.key, sparkErr);
			}

			hostBox.appendChild(row);
		});

		// ── Database rings ───────────────────────────────────────────────
		var preferred = (model.default_db || '').trim();
		var selected  = databases.some(function(db) { return db.name === preferred; }) ? preferred : databases[0].name;

		function updateRings(activeDb) {
			rings.querySelectorAll('.pgdb-widget__ring').forEach(function(ring) {
				ring.classList.toggle('is-active', ring.dataset.dbName === activeDb);
			});
		}

		// ── Metric definitions ───────────────────────────────────────────
		var metricThemes = {
			active_connections: 'blue',
			wal_write:          'teal',
			wal_receive:        'teal',
			wal_count:          'teal',
			db_size:            'green',
			backends:           'blue',
			temp_bytes_rate:    'purple',
			commit_rate:        'green',
			rollback_rate:      'orange',
			locks_total:        'orange',
			deadlocks_rate:     'red',
			slow_queries:       'red'
		};

		var orderedMetrics = [
			{key: 'active_connections', title: 'Active connections',    source: 'cluster', visible: 'show_active_connections'},
			{key: 'wal_write',          title: 'WAL write/s',           source: 'cluster', visible: 'show_wal_write'},
			{key: 'db_size',            title: 'Database size',                            visible: 'show_db_size'},
			{key: 'backends',           title: 'Active connections (DB)',                   visible: 'show_backends'},
			{key: 'temp_bytes_rate',    title: 'Temp bytes/s',                             visible: 'show_temp_bytes'},
			{key: 'commit_rate',        title: 'Commits/s',                                visible: 'show_commit_rate'},
			{key: 'rollback_rate',      title: 'Rollbacks/s',                              visible: 'show_rollback_rate'},
			{key: 'locks_total',        title: 'Locks total',                              visible: 'show_locks_total'},
			{key: 'deadlocks_rate',     title: 'Deadlocks/s',                              visible: 'show_deadlocks_rate'},
			{key: 'slow_queries',       title: 'Slow queries',                             visible: 'show_slow_queries'},
			{key: 'wal_receive',        title: 'WAL receive/s',         source: 'cluster', visible: 'show_wal_receive'},
			{key: 'wal_count',          title: 'WAL segments',          source: 'cluster', visible: 'show_wal_count'}
		];

		// ── Draw cards for selected DB ───────────────────────────────────
		function draw(dbName) {
			var db = null;
			for (var i = 0; i < databases.length; i++) {
				if (databases[i].name === dbName) { db = databases[i]; break; }
			}
			cards.innerHTML = '';
			updateRings(dbName);
			if (!db) { return; }

			var metrics = db.metrics || {};

			orderedMetrics.forEach(function(spec) {
				if (!isMetricVisible(spec.key, spec.visible)) { return; }

				var metric = spec.source === 'cluster'
					? (clusterMetrics[spec.key] || null)
					: (metrics[spec.key] || null);

				var card = document.createElement('div');
				card.className = 'pgdb-widget__card';
				card.setAttribute('data-theme', metricThemes[spec.key] || 'blue');

				var titleEl = document.createElement('div');
				titleEl.className = 'pgdb-widget__metric-title';
				titleEl.textContent = spec.title;
				titleEl.title = spec.title;

				var valueEl = document.createElement('div');
				valueEl.className = 'pgdb-widget__metric-value';
				valueEl.textContent = self._formatValue(metric ? metric.value : null, metric ? metric.units : null);

				card.appendChild(titleEl);
				card.appendChild(valueEl);

				try {
					// Use real history array from the metric; fall back to empty array
					var historyPts = (metric && Array.isArray(metric.history) && metric.history.length > 1)
						? metric.history
						: null;

					var svg = self._buildSparkline(historyPts, metric ? metric.value : null);
					card.appendChild(svg);
				} catch (sparkErr) {
					console.warn('[PgsqlClusterWidget] sparkline failed for', spec.key, sparkErr);
				}

				cards.appendChild(card);
			});
		}

		databases.forEach(function(db) {
			var li = document.createElement('li');
			li.className = 'pgdb-widget__ring';
			li.dataset.dbName = db.name;

			var btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'pgdb-widget__ring-btn';
			btn.textContent = db.name;
			btn.onclick = function() { draw(db.name); };

			li.appendChild(btn);
			rings.appendChild(li);
		});

		draw(selected);
	}

	/**
	 * Build a sparkline SVG.
	 *
	 * @param {number[]|null} historyPts  Real history values (oldest→newest), or null for no-data state.
	 * @param {*}             rawValue    The current lastvalue, used as the final point if history is sparse.
	 */
	_buildSparkline(historyPts, rawValue) {
		var W = 200, H = 36;
		var ns  = 'http://www.w3.org/2000/svg';

		var pts;

		if (historyPts && historyPts.length >= 2) {
			// Real data: use as-is, ensure last point equals current lastvalue when available
			pts = historyPts.slice();
			var currentVal = Number(rawValue);
			if (rawValue !== null && rawValue !== undefined && !isNaN(currentVal)) {
				pts[pts.length - 1] = currentVal;
			}
		} else {
			// No history available: draw a flat zero line so the card still has a chart area
			// but it's visually obvious there's no data (flat line at the bottom)
			pts = [0, 0, 0, 0, 0];
		}

		// Normalise to canvas coordinates
		var minV = pts[0], maxV = pts[0];
		for (var i = 1; i < pts.length; i++) {
			if (pts[i] < minV) { minV = pts[i]; }
			if (pts[i] > maxV) { maxV = pts[i]; }
		}

		var rng = maxV - minV;
		// If all values are the same (flat line), draw it mid-height so it's clearly intentional
		var mg   = H * 0.10;
		var useH = H - mg * 2;

		var coords = pts.map(function(v, idx) {
			var xPos = (idx / (pts.length - 1)) * W;
			var yPos = rng === 0
				? (H / 2)  // flat: centre of chart
				: (H - mg - ((v - minV) / rng) * useH);
			return [xPos, yPos];
		});

		// Catmull-Rom → cubic bezier path
		var d = 'M ' + coords[0][0].toFixed(2) + ',' + coords[0][1].toFixed(2);
		for (i = 0; i < coords.length - 1; i++) {
			var p0 = coords[Math.max(i - 1, 0)];
			var p1 = coords[i];
			var p2 = coords[i + 1];
			var p3 = coords[Math.min(i + 2, coords.length - 1)];
			var cp1x = (p1[0] + (p2[0] - p0[0]) / 6).toFixed(2);
			var cp1y = (p1[1] + (p2[1] - p0[1]) / 6).toFixed(2);
			var cp2x = (p2[0] - (p3[0] - p1[0]) / 6).toFixed(2);
			var cp2y = (p2[1] - (p3[1] - p1[1]) / 6).toFixed(2);
			d += ' C ' + cp1x + ',' + cp1y + ' ' + cp2x + ',' + cp2y + ' ' + p2[0].toFixed(2) + ',' + p2[1].toFixed(2);
		}

		var last  = coords[coords.length - 1];
		var areaD = d + ' L ' + last[0].toFixed(2) + ',' + H + ' L ' + coords[0][0].toFixed(2) + ',' + H + ' Z';

		var svg = document.createElementNS(ns, 'svg');
		svg.setAttribute('class', 'pgdb-widget__sparkline');
		svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
		svg.setAttribute('preserveAspectRatio', 'none');

		var area = document.createElementNS(ns, 'path');
		area.setAttribute('class', 'spark-area');
		area.setAttribute('d', areaD);

		var line = document.createElementNS(ns, 'path');
		line.setAttribute('class', 'spark-line');
		line.setAttribute('d', d);

		var dot = document.createElementNS(ns, 'circle');
		dot.setAttribute('class', 'spark-dot');
		dot.setAttribute('cx', last[0].toFixed(2));
		dot.setAttribute('cy', last[1].toFixed(2));
		dot.setAttribute('r', '2.5');

		svg.appendChild(area);
		svg.appendChild(line);
		svg.appendChild(dot);
		return svg;
	}

	_formatValue(rawValue, units) {
		if (rawValue === null || rawValue === undefined || rawValue === '') { return 'n/a'; }
		var value = Number(rawValue);
		if (isNaN(value)) { return String(rawValue); }
		if (units === 'B') { return this._formatBytes(value); }
		if (Math.abs(value) >= 1000) { return value.toLocaleString() + (units ? ' ' + units : ''); }
		var shown = Math.abs(value) < 10 ? value.toFixed(2) : value.toFixed(1);
		return shown + (units ? ' ' + units : '');
	}

	_formatBytes(bytes) {
		var us = ['B', 'KB', 'MB', 'GB', 'TB'];
		var v = bytes, idx = 0;
		while (Math.abs(v) >= 1024 && idx < us.length - 1) { v /= 1024; idx++; }
		return v.toFixed(Math.abs(bytes) >= 1024 ? 2 : 0) + ' ' + us[idx];
	}
};
