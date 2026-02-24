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
	 * Y-axis is ALWAYS anchored at 0 (bottom = 0, top = maxValue).
	 * This guarantees that data values >= 0 never render below the baseline.
	 * A SVG <clipPath> is used as a hard safety net to prevent any pixel from
	 * escaping the viewBox regardless of floating-point arithmetic.
	 *
	 * @param {number[]|null} historyPts  Raw history values oldest→newest, or null.
	 * @param {*}             rawValue    Current lastvalue (replaces last history point).
	 * @param {string}        metricKey   Used to apply per-metric normalization (e.g. cache_hit).
	 */
	_buildSparkline(historyPts, rawValue, metricKey) {
		var W = 200, H = 36;
		var ns = 'http://www.w3.org/2000/svg';

		// ── 1. Build the points array ─────────────────────────────────────────
		var pts;

		if (historyPts && historyPts.length >= 2) {
			// Drop any negative / non-finite sentinel values Zabbix may store.
			pts = historyPts.filter(function (v) { return v >= 0 && isFinite(v); });

			if (pts.length < 2) {
				pts = [0, 0, 0, 0, 0];
			} else {
				// cache_hit normalisation: Zabbix may store 0-1 ratio while display
				// shows 0-100 %, or vice-versa. Make history consistent with lastvalue.
				if (metricKey === 'cache_hit') {
					var lastRaw = Number(rawValue);
					var histMax = Math.max.apply(null, pts);
					if (histMax <= 1.0 && lastRaw > 1.0) {
						pts = pts.map(function (v) { return v * 100; });
					} else if (histMax > 1.0 && lastRaw >= 0 && lastRaw <= 1.0) {
						rawValue = lastRaw * 100;
					}
				}

				// Replace last history point with the current live value.
				var currentVal = Number(rawValue);
				if (rawValue !== null && rawValue !== undefined && !isNaN(currentVal) && currentVal >= 0) {
					pts[pts.length - 1] = currentVal;
				}
			}
		} else {
			// No usable history → flat line at baseline.
			pts = [0, 0, 0, 0, 0];
		}

		// ── 2. Compute Y scale anchored at 0 ─────────────────────────────────
		// maxV is the highest value; the baseline is always 0.
		// This means values >= 0 can NEVER be plotted below the canvas bottom.
		var maxV = 0;
		for (var i = 0; i < pts.length; i++) {
			if (pts[i] > maxV) { maxV = pts[i]; }
		}

		// Small top/bottom padding so the line and dot never touch the SVG edge.
		var padTop = H * 0.12;   // pixels reserved at top
		var padBot = H * 0.08;   // pixels reserved at bottom (above the visual baseline)
		var drawH = H - padTop - padBot; // usable drawing height

		// Map a value to a Y coordinate.
		// value=0      → Y = H - padBot  (bottom of drawing area)
		// value=maxV   → Y = padTop       (top of drawing area)
		function cy(v) {
			if (maxV === 0) {
				// All values are 0: flat line sits on the baseline.
				return H - padBot;
			}
			var frac = Math.max(0, Math.min(1, v / maxV));
			return padTop + (1 - frac) * drawH;
		}

		// ── 3. Compute canvas X/Y for every point ────────────────────────────
		var n = pts.length;
		var coords = pts.map(function (v, idx) {
			return [(idx / (n - 1)) * W, cy(v)];
		});

		// ── 4. Build SVG path using straight line segments ───────────────────
		// Straight lines cannot overshoot; they are the only option that is
		// 100 % guaranteed to stay within [padTop, H-padBot].
		var d = 'M ' + coords[0][0].toFixed(2) + ',' + coords[0][1].toFixed(2);
		for (i = 1; i < coords.length; i++) {
			d += ' L ' + coords[i][0].toFixed(2) + ',' + coords[i][1].toFixed(2);
		}

		// Filled area: close the path down to the visual baseline and back.
		var baselineY = (H - padBot).toFixed(2);
		var last = coords[coords.length - 1];
		var areaD = d
			+ ' L ' + last[0].toFixed(2) + ',' + baselineY
			+ ' L ' + coords[0][0].toFixed(2) + ',' + baselineY
			+ ' Z';

		// ── 5. Build the SVG element with a clipPath safety net ──────────────
		var svg = document.createElementNS(ns, 'svg');
		svg.setAttribute('class', 'pgdb-widget__sparkline');
		svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
		svg.setAttribute('preserveAspectRatio', 'none');
		svg.style.overflow = 'hidden';

		// clipPath guarantees nothing can escape the viewBox, even due to
		// floating-point rounding or future code changes.
		var clipId = 'spark-clip-' + Math.random().toString(36).slice(2);
		var defs = document.createElementNS(ns, 'defs');
		var clip = document.createElementNS(ns, 'clipPath');
		clip.setAttribute('id', clipId);
		var clipRect = document.createElementNS(ns, 'rect');
		clipRect.setAttribute('x', '0');
		clipRect.setAttribute('y', '0');
		clipRect.setAttribute('width', String(W));
		clipRect.setAttribute('height', String(H));
		clip.appendChild(clipRect);
		defs.appendChild(clip);
		svg.appendChild(defs);

		var area = document.createElementNS(ns, 'path');
		area.setAttribute('class', 'spark-area');
		area.setAttribute('d', areaD);
		area.setAttribute('clip-path', 'url(#' + clipId + ')');

		var line = document.createElementNS(ns, 'path');
		line.setAttribute('class', 'spark-line');
		line.setAttribute('d', d);
		line.setAttribute('clip-path', 'url(#' + clipId + ')');

		var dot = document.createElementNS(ns, 'circle');
		dot.setAttribute('class', 'spark-dot');
		dot.setAttribute('cx', last[0].toFixed(2));
		dot.setAttribute('cy', last[1].toFixed(2));
		dot.setAttribute('r', '2.5');
		dot.setAttribute('clip-path', 'url(#' + clipId + ')');

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
