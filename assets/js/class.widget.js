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

		// Try to load PNG; if it exists swap it in, otherwise keep SVG
		var icon = root.querySelector('.js-pgdb-icon');
		if (icon && icon.dataset.pngSrc && !icon.dataset.pngChecked) {
			icon.dataset.pngChecked = '1';
			var probe = new Image();
			probe.onload = function () { icon.src = icon.dataset.pngSrc; };
			probe.onerror = function () { /* keep SVG */ };
			probe.src = icon.dataset.pngSrc;
		}

		var model = {};
		try {
			model = JSON.parse(root.dataset.model || '{}');
		} catch (_e) {
			model = { error: 'Kan widget data niet lezen.' };
		}

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

		var databases = Array.isArray(model.databases) ? model.databases : [];
		var clusterMetrics = model.cluster_metrics || {};
		var hostMetrics = model.host_metrics || {};
		var visibility = model.visibility || {};
		var visibleMetricKeys = new Set(Array.isArray(model.visible_metric_keys) ? model.visible_metric_keys : []);
		var visibleHostKeys = new Set(Array.isArray(model.visible_host_metric_keys) ? model.visible_host_metric_keys : []);
		var cpuWarn = Number(model.cpu_warn_threshold != null ? model.cpu_warn_threshold : 1.0);
		var cpuHigh = Number(model.cpu_high_threshold != null ? model.cpu_high_threshold : 2.0);

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
			{ key: 'host_cpu_load_avg1_key', fallback: 'Host CPU load (avg1)', visible: 'show_host_cpu_avg1' },
			{ key: 'host_cpu_load_avg5_key', fallback: 'Host CPU load (avg5)', visible: 'show_host_cpu_avg5' },
			{ key: 'host_cpu_load_avg15_key', fallback: 'Host CPU load (avg15)', visible: 'show_host_cpu_avg15' },
			{ key: 'host_memory_total_key', fallback: 'Host memory total', visible: 'show_host_mem_total' },
			{ key: 'host_memory_available_key', fallback: 'Host memory available', visible: 'show_host_mem_available' }
		];

		hostOrdered.forEach(function (spec) {
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
				var svg = self._buildSparkline(historyPts, metric ? metric.value : null, spec.key);
				row.appendChild(svg);
			} catch (sparkErr) {
				console.warn('[PgsqlClusterWidget] host sparkline failed for', spec.key, sparkErr);
			}

			hostBox.appendChild(row);
		});

		// ── Database rings ───────────────────────────────────────────────
		var preferred = (model.default_db || '').trim();
		var selected = databases.some(function (db) { return db.name === preferred; }) ? preferred : databases[0].name;

		function updateRings(activeDb) {
			rings.querySelectorAll('.pgdb-widget__ring').forEach(function (ring) {
				ring.classList.toggle('is-active', ring.dataset.dbName === activeDb);
			});
		}

		// ── Metric definitions ───────────────────────────────────────────
		var metricThemes = {
			active_connections: 'blue',
			wal_write: 'teal',
			wal_receive: 'teal',
			wal_count: 'teal',
			db_size: 'green',
			backends: 'blue',
			temp_bytes_rate: 'purple',
			commit_rate: 'green',
			rollback_rate: 'orange',
			locks_total: 'orange',
			deadlocks_rate: 'red',
			slow_queries: 'red',
			cache_hit: 'green',
			replication_lag: 'orange',
			bloat: 'red'
		};

		var orderedMetrics = [
			{ key: 'active_connections', title: 'Active connections', source: 'cluster', visible: 'show_active_connections' },
			{ key: 'wal_write', title: 'WAL write/s', source: 'cluster', visible: 'show_wal_write' },
			{ key: 'db_size', title: 'Database size', visible: 'show_db_size' },
			{ key: 'backends', title: 'Active connections (DB)', visible: 'show_backends' },
			{ key: 'temp_bytes_rate', title: 'Temp bytes/s', visible: 'show_temp_bytes' },
			{ key: 'commit_rate', title: 'Commits/s', visible: 'show_commit_rate' },
			{ key: 'rollback_rate', title: 'Rollbacks/s', visible: 'show_rollback_rate' },
			{ key: 'locks_total', title: 'Locks total', visible: 'show_locks_total' },
			{ key: 'deadlocks_rate', title: 'Deadlocks/s', visible: 'show_deadlocks_rate' },
			{ key: 'slow_queries', title: 'Slow queries', visible: 'show_slow_queries' },
			{ key: 'wal_receive', title: 'WAL receive/s', source: 'cluster', visible: 'show_wal_receive' },
			{ key: 'wal_count', title: 'WAL segments', source: 'cluster', visible: 'show_wal_count' },
			{ key: 'cache_hit', title: 'Cache hit ratio', source: 'cluster', visible: 'show_cache_hit' },
			{ key: 'replication_lag', title: 'Replication lag (s)', source: 'cluster', visible: 'show_replication_lag' },
			{ key: 'bloat', title: 'Bloating tables', visible: 'show_bloat' }
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

			orderedMetrics.forEach(function (spec) {
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
				var rawVal = metric ? metric.value : null;
				var rawUnit = metric ? metric.units : null;
				if (spec.key === 'cache_hit') {
					var pct = Number(rawVal);
					valueEl.textContent = (rawVal !== null && !isNaN(pct))
						? ((pct <= 1 ? pct * 100 : pct).toFixed(2) + ' %')
						: 'n/a';
				} else if (spec.key === 'replication_lag') {
					var secs = Number(rawVal);
					valueEl.textContent = (rawVal !== null && !isNaN(secs))
						? (secs.toFixed(1) + ' s')
						: 'n/a';
				} else if (spec.key === 'bloat') {
					var n = Number(rawVal);
					valueEl.textContent = (rawVal !== null && !isNaN(n))
						? Math.round(n).toLocaleString()
						: 'n/a';
				} else {
					valueEl.textContent = self._formatValue(rawVal, rawUnit);
				}

				card.appendChild(titleEl);
				card.appendChild(valueEl);

				try {
					// Use real history array from the metric; fall back to empty array
					var historyPts = (metric && Array.isArray(metric.history) && metric.history.length > 1)
						? metric.history
						: null;

					var svg = self._buildSparkline(historyPts, metric ? metric.value : null, spec.key);
					card.appendChild(svg);
				} catch (sparkErr) {
					console.warn('[PgsqlClusterWidget] sparkline failed for', spec.key, sparkErr);
				}

				cards.appendChild(card);
			});
		}

		databases.forEach(function (db) {
			var li = document.createElement('li');
			li.className = 'pgdb-widget__ring';
			li.dataset.dbName = db.name;

			var btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'pgdb-widget__ring-btn';
			btn.textContent = db.name;
			btn.onclick = function () { draw(db.name); };

			li.appendChild(btn);
			rings.appendChild(li);
		});

		draw(selected);
	}

	/**
	 * Build a sparkline SVG.
	 *
	 * Identical algorithm for ALL sparklines (host metrics AND metric cards).
	 * min→max Y-scaling, Catmull-Rom smooth curves.
	 *
	 * Root-cause of "below 0" artifacts:
	 *   Catmull-Rom can dip below baselineY (e.g. Y=34) while still inside the
	 *   SVG viewBox (H=36). When the fill-path then closes back to baselineY=32.4
	 *   it runs BACKWARDS, drawing an inverted fill. A viewBox-level clipPath
	 *   does NOT help because 34 < 36 — everything is inside the viewBox.
	 *
	 * Solution: the <path class="spark-area"> gets its OWN clipPath that is
	 *   capped at baselineY. Even if the bezier dips below baseline, the fill
	 *   is clipped and can never appear there. The line/dot use the full clip.
	 *
	 * @param {number[]|null} historyPts  Raw history values oldest→newest, or null.
	 * @param {*}             rawValue    Current lastvalue (replaces last history point).
	 * @param {string}        metricKey   Per-metric normalization (e.g. cache_hit).
	 */
	_buildSparkline(historyPts, rawValue, metricKey) {
		var W = 200, H = 36;
		var ns = 'http://www.w3.org/2000/svg';

		// ── 1. Build points array ─────────────────────────────────────────────
		var pts;

		if (historyPts && historyPts.length >= 2) {
			pts = historyPts.filter(function (v) { return v >= 0 && isFinite(v); });

			if (pts.length < 2) {
				pts = [0, 0, 0, 0, 0];
			} else {
				// cache_hit: normalise 0-1 ratio vs 0-100 percentage
				if (metricKey === 'cache_hit') {
					var lastRaw = Number(rawValue);
					var histMax = Math.max.apply(null, pts);
					if (histMax <= 1.0 && lastRaw > 1.0) {
						pts = pts.map(function (v) { return v * 100; });
					} else if (histMax > 1.0 && lastRaw >= 0 && lastRaw <= 1.0) {
						rawValue = lastRaw * 100;
					}
				}

				// Replace last history point with current live value
				var currentVal = Number(rawValue);
				if (rawValue !== null && rawValue !== undefined && !isNaN(currentVal) && currentVal >= 0) {
					pts[pts.length - 1] = currentVal;
				}
			}
		} else {
			pts = [0, 0, 0, 0, 0];
		}

		// ── 2. Y scale: min→max, minV clamped to ≥ 0 ─────────────────────────
		var minV = Math.max(0, pts[0]);
		var maxV = pts[0];
		for (var i = 1; i < pts.length; i++) {
			if (pts[i] < minV) { minV = pts[i]; }
			if (pts[i] > maxV) { maxV = pts[i]; }
		}
		minV = Math.max(0, minV);

		var rng = maxV - minV;
		var mg = H * 0.10;
		var useH = H - mg * 2;

		function cy(v) {
			if (rng === 0) { return H / 2; }
			var y = H - mg - ((v - minV) / rng) * useH;
			return Math.max(mg, Math.min(H - mg, y));
		}

		// ── 3. Canvas coordinates ─────────────────────────────────────────────
		var n = pts.length;
		var coords = pts.map(function (v, idx) {
			return [(idx / (n - 1)) * W, cy(v)];
		});

		// ── 4. Catmull-Rom → cubic bezier ────────────────────────────────────
		var d = 'M ' + coords[0][0].toFixed(2) + ',' + coords[0][1].toFixed(2);
		for (i = 0; i < coords.length - 1; i++) {
			var p0 = coords[Math.max(i - 1, 0)];
			var p1 = coords[i];
			var p2 = coords[i + 1];
			var p3 = coords[Math.min(i + 2, coords.length - 1)];
			var cp1x = (p1[0] + (p2[0] - p0[0]) / 6).toFixed(2);
			var cp1y = Math.max(mg, Math.min(H - mg, p1[1] + (p2[1] - p0[1]) / 6)).toFixed(2);
			var cp2x = (p2[0] - (p3[0] - p1[0]) / 6).toFixed(2);
			var cp2y = Math.max(mg, Math.min(H - mg, p2[1] - (p3[1] - p1[1]) / 6)).toFixed(2);
			d += ' C ' + cp1x + ',' + cp1y + ' ' + cp2x + ',' + cp2y + ' ' + p2[0].toFixed(2) + ',' + p2[1].toFixed(2);
		}

		var baselineY = H - mg;          // numeric, for the clipPath rect height
		var baselineYStr = baselineY.toFixed(2);
		var last = coords[coords.length - 1];
		var areaD = d
			+ ' L ' + last[0].toFixed(2) + ',' + baselineYStr
			+ ' L ' + coords[0][0].toFixed(2) + ',' + baselineYStr
			+ ' Z';

		// ── 5. Build SVG ──────────────────────────────────────────────────────
		var uid = Math.random().toString(36).slice(2);

		var svg = document.createElementNS(ns, 'svg');
		svg.setAttribute('class', 'pgdb-widget__sparkline');
		svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
		svg.setAttribute('preserveAspectRatio', 'none');

		// ── Two clipPaths ─────────────────────────────────────────────────────
		// clipFill: caps the fill at exactly baselineY so a bezier that dips
		//           slightly below baseline (but inside the viewBox) never
		//           creates an inverted fill artifact.
		// clipAll:  clips the line + dot to the full viewBox.
		var defs = document.createElementNS(ns, 'defs');

		function makeClipRect(id, height) {
			var cp = document.createElementNS(ns, 'clipPath');
			cp.setAttribute('id', id);
			var r = document.createElementNS(ns, 'rect');
			r.setAttribute('x', '0');
			r.setAttribute('y', '0');
			r.setAttribute('width', String(W));
			r.setAttribute('height', String(height));
			cp.appendChild(r);
			return cp;
		}

		var idFill = 'spk-fill-' + uid;
		var idAll = 'spk-all-' + uid;
		defs.appendChild(makeClipRect(idFill, baselineY));   // stops AT baseline
		defs.appendChild(makeClipRect(idAll, H));            // full viewBox
		svg.appendChild(defs);

		var area = document.createElementNS(ns, 'path');
		area.setAttribute('class', 'spark-area');
		area.setAttribute('d', areaD);
		area.setAttribute('clip-path', 'url(#' + idFill + ')');   // ← baseline-capped clip

		var line = document.createElementNS(ns, 'path');
		line.setAttribute('class', 'spark-line');
		line.setAttribute('d', d);
		line.setAttribute('clip-path', 'url(#' + idAll + ')');

		var dot = document.createElementNS(ns, 'circle');
		dot.setAttribute('class', 'spark-dot');
		dot.setAttribute('cx', last[0].toFixed(2));
		dot.setAttribute('cy', last[1].toFixed(2));
		dot.setAttribute('r', '2.5');
		dot.setAttribute('clip-path', 'url(#' + idAll + ')');

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
