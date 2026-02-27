<?php

declare(strict_types=1);

namespace Modules\PgsqlClusterWidget\Actions;

use API;
use CControllerDashboardWidgetView;
use CControllerResponseData;

class WidgetView extends CControllerDashboardWidgetView
{
	private const HISTORY_LIMIT = 20;

	private const METRICS = [
		'pgsql.db.size['                    => 'db_size',
		'pgsql.dbstat.numbackends['         => 'backends',
		'pgsql.dbstat.temp_bytes.rate['     => 'temp_bytes_rate',
		'pgsql.dbstat.xact_commit.rate['    => 'commit_rate',
		'pgsql.dbstat.xact_rollback.rate['  => 'rollback_rate',
		'pgsql.dbstat.deadlocks.rate['      => 'deadlocks_rate',
		'pgsql.locks.total['                => 'locks_total',
		'pgsql.queries.query.slow_count['   => 'slow_queries',
		'pgsql.db.bloating_tables['         => 'bloat'
	];

	private const CLUSTER_METRICS = [
		'pgsql.connections.sum.total_pct'           => 'active_connections',
		'pgsql.wal.write'                           => 'wal_write',
		'pgsql.wal.receive'                         => 'wal_receive',
		'pgsql.wal.count'                           => 'wal_count',
		'pgsql.cache.hit'                           => 'cache_hit',
		'pgsql.connections.sum.idle_in_transaction' => 'idle_in_transaction',
		'pgsql.bgwriter.checkpoint_write_time.rate' => 'checkpoint_write_time',
	];

	private const CLUSTER_METRICS_PREFIX = [
		'pgsql.replication.lag.sec['  => 'replication_lag',
		'pgsql.oldest.xid['           => 'xid_age',
	];

	protected function doAction(): void
	{
		try {
			$fields             = $this->fields_values;
			$cpu_warn_threshold = $this->toFloat($fields['cpu_warn_threshold'] ?? 1.00, 1.00);
			$cpu_high_threshold = $this->toFloat($fields['cpu_high_threshold'] ?? 2.00, 2.00);
			$zabbix_base_url    = trim((string)($fields['zabbix_base_url'] ?? ''));
			$graph_period       = trim((string)($fields['graph_period'] ?? '86400'));
			$alert_severity     = (int)($fields['alert_severity'] ?? 3);
			$hostid             = $this->extractHostId($fields['hostids'] ?? null);
			$discovery_itemid   = $this->extractItemId($fields['discovery_itemid'] ?? null);

			// Health weights (default to original percentages, must sum to 100)
			$health_weights = [
				'connectivity'  => $this->toFloat($fields['health_weight_connectivity'] ?? 25, 25),
				'integriteit'   => $this->toFloat($fields['health_weight_integriteit']  ?? 20, 20),
				'stabiliteit'   => $this->toFloat($fields['health_weight_stabiliteit']  ?? 20, 20),
				'efficiency'    => $this->toFloat($fields['health_weight_efficiency']   ?? 20, 20),
				'replication'   => $this->toFloat($fields['health_weight_replication']  ?? 10, 10),
				'bloat'         => $this->toFloat($fields['health_weight_bloat']        ?? 5,  5),
			];

			if ($hostid === null && $discovery_itemid === null) {
				$this->setResponse(new CControllerResponseData([
					'name'            => $this->widget->getDefaultName(),
					'databases'       => [],
					'error'           => _('Select a host first.'),
					'default_db'      => $fields['default_db'] ?? '',
					'zabbix_base_url' => $zabbix_base_url,
					'graph_period'    => $graph_period,
					'icon_url'        => $this->iconUrl(),
					'user'            => ['debug_mode' => $this->getDebugMode()]
				]));
				return;
			}

			if ($discovery_itemid !== null) {
				$discovery_item = API::Item()->get([
					'output'   => ['itemid', 'hostid', 'name', 'key_'],
					'itemids'  => [$discovery_itemid],
					'webitems' => true
				]);
				if ($discovery_item) {
					$hostid           = (string)$discovery_item[0]['hostid'];
					$discovery_itemid = (string)$discovery_item[0]['itemid'];
				} else {
					$discovery_itemid = null;
				}
			} else {
				$discovery_itemid = $this->findDiscoveryItemIdByHost($hostid);
			}

			$discovered_db_names = $discovery_itemid !== null
				? $this->getDiscoveredDatabases($discovery_itemid)
				: [];

			$all_items = $this->fetchAllItems($hostid);

			$metrics_by_db            = $this->getMetricsByDatabase($all_items);
			$cluster_metrics          = $this->getClusterMetrics($all_items);
			$host_metrics             = $this->getHostMetrics($all_items, $fields);
			$visibility               = $this->buildVisibility($fields);
			$visible_metric_keys      = $this->buildVisibleMetricKeys($visibility);
			$visible_host_metric_keys = $this->buildVisibleHostMetricKeys($visibility);

			if (!$discovered_db_names) {
				$discovered_db_names = array_keys($metrics_by_db);
				sort($discovered_db_names);
			}

			$item_ids_for_history = $this->collectItemIdsForHistory(
				$all_items, $cluster_metrics, $host_metrics, $metrics_by_db
			);
			$history_map = $this->fetchHistoryBulk($item_ids_for_history);

			$cluster_metrics = $this->attachHistory($cluster_metrics, $history_map);
			$host_metrics    = $this->attachHistory($host_metrics, $history_map);
			foreach ($metrics_by_db as $db_name => $db_metrics) {
				$metrics_by_db[$db_name] = $this->attachHistory($db_metrics, $history_map);
			}

			// ── Active triggers / problems per item ───────────────────────
			$active_problems = $this->fetchActiveProblems($hostid, $alert_severity);

			// Collect all itemids used by this widget so we can match problems
			$all_widget_itemids = $this->collectAllItemIds(
				$cluster_metrics, $host_metrics, $metrics_by_db
			);

			// Build itemid => highest severity problem map
			$problem_map = $this->buildProblemMap($active_problems, $all_widget_itemids);

			// Attach problem info to each metric
			$cluster_metrics = $this->attachProblems($cluster_metrics, $problem_map);
			$host_metrics    = $this->attachProblems($host_metrics, $problem_map);
			foreach ($metrics_by_db as $db_name => $db_metrics) {
				$metrics_by_db[$db_name] = $this->attachProblems($db_metrics, $problem_map);
			}

			$databases = [];
			foreach ($discovered_db_names as $db_name) {
				$databases[] = [
					'name'    => $db_name,
					'metrics' => $metrics_by_db[$db_name] ?? []
				];
			}

			$this->setResponse(new CControllerResponseData([
				'name'                     => $this->widget->getDefaultName(),
				'databases'                => $databases,
				'cluster_metrics'          => $cluster_metrics,
				'host_metrics'             => $host_metrics,
				'visibility'               => $visibility,
				'visible_metric_keys'      => $visible_metric_keys,
				'visible_host_metric_keys' => $visible_host_metric_keys,
				'cpu_warn_threshold'       => $cpu_warn_threshold,
				'cpu_high_threshold'       => $cpu_high_threshold,
				'health_weights'           => $health_weights,
				'default_db'               => $fields['default_db'] ?? '',
				'zabbix_base_url'          => $zabbix_base_url,
				'graph_period'             => $graph_period,
				'error'                    => null,
				'icon_url'                 => $this->iconUrl(),
				'user'                     => ['debug_mode' => $this->getDebugMode()]
			]));
		} catch (\Throwable $e) {
			$this->setErrorResponse(sprintf('View action error: %s', $e->getMessage()));
		}
	}

	// ── Active problems ──────────────────────────────────────────────────────

	private function fetchActiveProblems(string $hostid, int $min_severity): array
	{
		return API::Problem()->get([
			'output'            => ['eventid', 'objectid', 'severity', 'name'],
			'hostids'           => [$hostid],
			'severities'        => array_values(array_filter(
				[0, 1, 2, 3, 4, 5],
				fn($s) => $s >= $min_severity
			)),
			'suppressed'        => false,
			'recent'            => false,
		]) ?: [];
	}

	private function collectAllItemIds(array ...$metric_groups): array
	{
		$ids = [];
		foreach ($metric_groups as $group) {
			if (!is_array($group)) continue;
			// Could be flat (cluster/host) or nested (metrics_by_db)
			foreach ($group as $key => $value) {
				if (is_array($value) && isset($value['itemid'])) {
					$ids[] = (string)$value['itemid'];
				} elseif (is_array($value)) {
					// nested: db => [metric => data]
					foreach ($value as $metric) {
						if (is_array($metric) && isset($metric['itemid'])) {
							$ids[] = (string)$metric['itemid'];
						}
					}
				}
			}
		}
		return array_unique($ids);
	}

	private function buildProblemMap(array $problems, array $widget_itemids): array
	{
		// Zabbix Problem->get returns objectid = triggerid, not itemid.
		// We need to resolve triggers to their items.
		if (!$problems) return [];

		$trigger_ids = array_unique(array_column($problems, 'objectid'));

		$triggers = API::Trigger()->get([
			'output'      => ['triggerid'],
			'triggerids'  => $trigger_ids,
			'selectItems' => ['itemid'],
		]) ?: [];

		// triggerid => [itemid, ...]
		$trigger_items = [];
		foreach ($triggers as $trigger) {
			$trigger_items[$trigger['triggerid']] = array_column($trigger['items'], 'itemid');
		}

		// severity colors
		$severity_colors = [
			0 => '#90a4ae', // not classified
			1 => '#aed6f1', // information
			2 => '#ffd54f', // warning
			3 => '#ff9800', // average
			4 => '#f44336', // high
			5 => '#b71c1c', // disaster
		];
		$severity_labels = [
			0 => 'Not classified', 1 => 'Information', 2 => 'Warning',
			3 => 'Average', 4 => 'High', 5 => 'Disaster'
		];

		$problem_map = []; // itemid => {severity, color, name}

		foreach ($problems as $problem) {
			$triggerid = (string)$problem['objectid'];
			$severity  = (int)$problem['severity'];
			$item_ids  = $trigger_items[$triggerid] ?? [];

			foreach ($item_ids as $iid) {
				$iid = (string)$iid;
				if (!in_array($iid, $widget_itemids, true)) continue;
				// Keep highest severity per item
				if (!isset($problem_map[$iid]) || $severity > $problem_map[$iid]['severity']) {
					$problem_map[$iid] = [
						'severity' => $severity,
						'color'    => $severity_colors[$severity] ?? '#f44336',
						'label'    => $severity_labels[$severity] ?? 'Problem',
						'name'     => $problem['name'],
					];
				}
			}
		}

		return $problem_map;
	}

	private function attachProblems(array $metrics, array $problem_map): array
	{
		foreach ($metrics as $key => $metric) {
			if (!isset($metric['itemid'])) continue;
			$iid = (string)$metric['itemid'];
			$metrics[$key]['problem'] = $problem_map[$iid] ?? null;
		}
		return $metrics;
	}

	// ── Item fetching ────────────────────────────────────────────────────────

	private function fetchAllItems(string $hostid): array
	{
		return API::Item()->get([
			'output'    => ['itemid', 'name', 'key_', 'units', 'lastvalue', 'value_type'],
			'hostids'   => [$hostid],
			'monitored' => true,
			'webitems'  => true
		]);
	}

	// ── History ──────────────────────────────────────────────────────────────

	private function collectItemIdsForHistory(
		array $all_items,
		array $cluster_metrics,
		array $host_metrics,
		array $metrics_by_db = []
	): array {
		$item_vtypes = [];
		foreach ($all_items as $item) {
			$item_vtypes[(string)$item['itemid']] = (int)$item['value_type'];
		}

		$result  = [];
		$collect = function (array $metrics_group) use ($item_vtypes, &$result): void {
			foreach ($metrics_group as $metric) {
				if (!isset($metric['itemid'])) continue;
				$iid = (string)$metric['itemid'];
				if (array_key_exists($iid, $item_vtypes)) {
					$result[$iid] = $item_vtypes[$iid];
				}
			}
		};

		$collect($cluster_metrics);
		$collect($host_metrics);
		foreach ($metrics_by_db as $db_metrics) {
			$collect($db_metrics);
		}
		return $result;
	}

	private function fetchHistoryBulk(array $itemid_vtype_map): array
	{
		if (!$itemid_vtype_map) return [];

		$history_map = [];
		foreach ($itemid_vtype_map as $itemid => $vtype) {
			if ($vtype !== \ITEM_VALUE_TYPE_FLOAT && $vtype !== \ITEM_VALUE_TYPE_UINT64) continue;

			$rows = API::History()->get([
				'output'    => ['itemid', 'value'],
				'history'   => $vtype,
				'itemids'   => [$itemid],
				'sortfield' => 'clock',
				'sortorder' => \ZBX_SORT_DOWN,
				'limit'     => self::HISTORY_LIMIT
			]);

			if ($rows) {
				$values = [];
				foreach ($rows as $row) { $values[] = (float)$row['value']; }
				$history_map[$itemid] = array_reverse($values);
			}
		}
		return $history_map;
	}

	private function attachHistory(array $metrics, array $history_map): array
	{
		foreach ($metrics as $key => $metric) {
			if (!isset($metric['itemid'])) continue;
			$iid = (string)$metric['itemid'];
			$metrics[$key]['history'] = $history_map[$iid] ?? [];
		}
		return $metrics;
	}

	// ── Metric extraction ────────────────────────────────────────────────────

	private function buildMetricsPrefixMap(array $fields): array
	{
		$overrides = [
			'key_db_size'        => 'db_size',
			'key_backends'       => 'backends',
			'key_temp_bytes'     => 'temp_bytes_rate',
			'key_commit_rate'    => 'commit_rate',
			'key_rollback_rate'  => 'rollback_rate',
			'key_deadlocks_rate' => 'deadlocks_rate',
			'key_locks_total'    => 'locks_total',
			'key_slow_queries'   => 'slow_queries',
			'key_bloat'          => 'bloat',
		];

		$map = [];
		foreach ($overrides as $field_name => $alias) {
			$default_prefix = array_search($alias, self::METRICS, true);
			$prefix = trim((string)($fields[$field_name] ?? $default_prefix));
			if ($prefix === '') continue;
			if (substr($prefix, -1) !== '[') { $prefix .= '['; }
			$map[$prefix] = $alias;
		}
		return $map;
	}

	private function getMetricsByDatabase(array $items): array
	{
		$prefix_map = $this->buildMetricsPrefixMap($this->fields_values);
		$result = [];

		foreach ($items as $item) {
			$key        = $item['key_'];
			$metric_key = null;

			foreach ($prefix_map as $prefix => $label) {
				if (strpos($key, $prefix) === 0) { $metric_key = $label; break; }
			}
			if ($metric_key === null) continue;

			$db_name = $this->extractDbName($key);
			if ($db_name === null) continue;

			if (!array_key_exists($db_name, $result)) { $result[$db_name] = []; }

			$result[$db_name][$metric_key] = [
				'itemid'  => (string)$item['itemid'],
				'label'   => $item['name'],
				'value'   => $item['lastvalue'],
				'units'   => $item['units'],
				'history' => [],
				'problem' => null,
			];
		}
		return $result;
	}

	private function buildClusterMetricsMaps(array $fields): array
	{
		$exact_overrides = [
			'key_active_connections'    => 'active_connections',
			'key_wal_write'             => 'wal_write',
			'key_wal_receive'           => 'wal_receive',
			'key_wal_count'             => 'wal_count',
			'key_cache_hit'             => 'cache_hit',
			'key_idle_in_transaction'   => 'idle_in_transaction',
			'key_checkpoint_write_time' => 'checkpoint_write_time',
		];
		$exact_map = [];
		foreach ($exact_overrides as $field_name => $alias) {
			$default_key = array_search($alias, self::CLUSTER_METRICS, true);
			$key = trim((string)($fields[$field_name] ?? $default_key));
			if ($key !== '') { $exact_map[$key] = $alias; }
		}

		$prefix_overrides = [
			'key_replication_lag' => 'replication_lag',
			'key_xid_age'         => 'xid_age',
		];
		$prefix_map = [];
		foreach ($prefix_overrides as $field_name => $alias) {
			$default_prefix = array_search($alias, self::CLUSTER_METRICS_PREFIX, true);
			$prefix = trim((string)($fields[$field_name] ?? $default_prefix));
			if ($prefix === '') continue;
			if (substr($prefix, -1) !== '[') { $prefix .= '['; }
			$prefix_map[$prefix] = $alias;
		}

		return [$exact_map, $prefix_map];
	}

	private function getClusterMetrics(array $items): array
	{
		[$exact_map, $prefix_map] = $this->buildClusterMetricsMaps($this->fields_values);
		$result = [];

		foreach ($items as $item) {
			$key = $item['key_'];
			if (array_key_exists($key, $exact_map)) {
				$result[$exact_map[$key]] = [
					'itemid'  => (string)$item['itemid'],
					'label'   => $item['name'],
					'value'   => $item['lastvalue'],
					'units'   => $item['units'],
					'history' => [],
					'problem' => null,
				];
				continue;
			}
			foreach ($prefix_map as $prefix => $alias) {
				if (strpos($key, $prefix) === 0 && !array_key_exists($alias, $result)) {
					$result[$alias] = [
						'itemid'  => (string)$item['itemid'],
						'label'   => $item['name'],
						'value'   => $item['lastvalue'],
						'units'   => $item['units'],
						'history' => [],
						'problem' => null,
					];
					break;
				}
			}
		}
		return $result;
	}

	private function getHostMetrics(array $items, array $fields): array
	{
		$config = [
			'host_cpu_load_avg1_key'    => ['default_key' => 'system.cpu.load[all,avg1]',  'label' => 'Host CPU load (avg1)'],
			'host_cpu_load_avg5_key'    => ['default_key' => 'system.cpu.load[all,avg5]',  'label' => 'Host CPU load (avg5)'],
			'host_cpu_load_avg15_key'   => ['default_key' => 'system.cpu.load[all,avg15]', 'label' => 'Host CPU load (avg15)'],
			'host_memory_total_key'     => ['default_key' => 'vm.memory.size[total]',      'label' => 'Host memory total'],
			'host_memory_available_key' => ['default_key' => 'vm.memory.size[available]',  'label' => 'Host memory available']
		];

		$key_to_alias = [];
		foreach ($config as $field_name => $row) {
			$key = trim((string)($fields[$field_name] ?? $row['default_key']));
			if ($key !== '') { $key_to_alias[$key] = $field_name; }
		}

		$result = [];
		foreach ($items as $item) {
			$key = $item['key_'];
			if (!array_key_exists($key, $key_to_alias)) continue;
			$alias = $key_to_alias[$key];
			$result[$alias] = [
				'itemid'  => (string)$item['itemid'],
				'label'   => $config[$alias]['label'],
				'value'   => $item['lastvalue'],
				'units'   => $item['units'],
				'history' => [],
				'problem' => null,
			];
		}
		return $result;
	}

	// ── Helpers ──────────────────────────────────────────────────────────────

	private function iconUrl(): string
	{
		return 'modules/' . basename(dirname(__DIR__)) . '/assets/img/postgres-icon-24.svg';
	}

	private function setErrorResponse(string $message): void
	{
		$this->setResponse(new CControllerResponseData([
			'name'                     => $this->widget->getDefaultName(),
			'databases'                => [],
			'cluster_metrics'          => [],
			'host_metrics'             => [],
			'visibility'               => [],
			'visible_metric_keys'      => [],
			'visible_host_metric_keys' => [],
			'cpu_warn_threshold'       => 1.00,
			'cpu_high_threshold'       => 2.00,
			'health_weights'           => [],
			'zabbix_base_url'          => '',
			'graph_period'             => '86400',
			'error'                    => $message,
			'default_db'               => '',
			'icon_url'                 => $this->iconUrl(),
			'user'                     => ['debug_mode' => $this->getDebugMode()]
		]));
	}

	// ── Discovery ────────────────────────────────────────────────────────────

	private function findDiscoveryItemIdByHost(string $hostid): ?string
	{
		$rules = API::DiscoveryRule()->get([
			'output'      => ['itemid', 'key_'],
			'hostids'     => [$hostid],
			'search'      => ['key_' => 'pgsql.db.discovery'],
			'searchByAny' => true,
			'sortfield'   => 'itemid',
			'sortorder'   => \ZBX_SORT_DOWN,
			'limit'       => 1,
			'inherited'   => true
		]);
		return $rules ? (string)$rules[0]['itemid'] : null;
	}

	private function getDiscoveredDatabases(string $discovery_itemid): array
	{
		$history = API::History()->get([
			'output'    => ['value'],
			'history'   => \ITEM_VALUE_TYPE_TEXT,
			'itemids'   => [$discovery_itemid],
			'sortfield' => 'clock',
			'sortorder' => \ZBX_SORT_DOWN,
			'limit'     => 1
		]);

		if (!$history) return [];
		$raw = json_decode($history[0]['value'], true);
		if (!is_array($raw)) return [];
		$rows = $raw['data'] ?? $raw;
		if (!is_array($rows)) return [];

		$db_names = [];
		foreach ($rows as $row) {
			if (is_array($row) && array_key_exists('{#DBNAME}', $row) && $row['{#DBNAME}'] !== '') {
				$db_names[] = (string)$row['{#DBNAME}'];
			}
		}
		$db_names = array_values(array_unique($db_names));
		sort($db_names);
		return $db_names;
	}

	// ── Visibility ───────────────────────────────────────────────────────────

	private function buildVisibility(array $fields): array
	{
		$keys = [
			'show_host_cpu_avg1', 'show_host_cpu_avg5', 'show_host_cpu_avg15',
			'show_host_mem_total', 'show_host_mem_available',
			'show_active_connections', 'show_wal_write', 'show_wal_receive',
			'show_wal_count', 'show_db_size', 'show_backends', 'show_temp_bytes',
			'show_commit_rate', 'show_rollback_rate', 'show_locks_total',
			'show_deadlocks_rate', 'show_slow_queries',
			'show_cache_hit', 'show_replication_lag', 'show_bloat',
			'show_xid_age', 'show_idle_in_transaction', 'show_checkpoint_write_time'
		];
		$result = [];
		foreach ($keys as $key) { $result[$key] = $this->toBool($fields[$key] ?? 1, true); }
		return $result;
	}

	private function buildVisibleMetricKeys(array $visibility): array
	{
		$map = [
			'active_connections'    => 'show_active_connections',
			'wal_write'             => 'show_wal_write',
			'wal_receive'           => 'show_wal_receive',
			'wal_count'             => 'show_wal_count',
			'db_size'               => 'show_db_size',
			'backends'              => 'show_backends',
			'temp_bytes_rate'       => 'show_temp_bytes',
			'commit_rate'           => 'show_commit_rate',
			'rollback_rate'         => 'show_rollback_rate',
			'locks_total'           => 'show_locks_total',
			'deadlocks_rate'        => 'show_deadlocks_rate',
			'slow_queries'          => 'show_slow_queries',
			'cache_hit'             => 'show_cache_hit',
			'replication_lag'       => 'show_replication_lag',
			'bloat'                 => 'show_bloat',
			'xid_age'               => 'show_xid_age',
			'idle_in_transaction'   => 'show_idle_in_transaction',
			'checkpoint_write_time' => 'show_checkpoint_write_time',
		];
		$result = [];
		foreach ($map as $metric_key => $visibility_key) {
			if (!array_key_exists($visibility_key, $visibility) || $visibility[$visibility_key]) {
				$result[] = $metric_key;
			}
		}
		return $result;
	}

	private function buildVisibleHostMetricKeys(array $visibility): array
	{
		$map = [
			'host_cpu_load_avg1_key'    => 'show_host_cpu_avg1',
			'host_cpu_load_avg5_key'    => 'show_host_cpu_avg5',
			'host_cpu_load_avg15_key'   => 'show_host_cpu_avg15',
			'host_memory_total_key'     => 'show_host_mem_total',
			'host_memory_available_key' => 'show_host_mem_available'
		];
		$result = [];
		foreach ($map as $metric_key => $visibility_key) {
			if (!array_key_exists($visibility_key, $visibility) || $visibility[$visibility_key]) {
				$result[] = $metric_key;
			}
		}
		return $result;
	}

	// ── Type helpers ─────────────────────────────────────────────────────────

	private function extractItemId($value): ?string
	{
		if (is_array($value) && $value) {
			$first = reset($value);
			if (is_array($first) && array_key_exists('itemid', $first)) return (string)$first['itemid'];
			return (string)$first;
		}
		if (is_scalar($value) && (string)$value !== '') {
			$itemid = trim((string)$value);
			return $itemid !== '' ? $itemid : null;
		}
		return null;
	}

	private function extractHostId($value): ?string
	{
		if (is_array($value) && $value) {
			$first = reset($value);
			if (is_array($first) && array_key_exists('hostid', $first)) return (string)$first['hostid'];
			return (string)$first;
		}
		if (is_scalar($value) && (string)$value !== '') {
			$hostid = trim((string)$value);
			return $hostid !== '' ? $hostid : null;
		}
		return null;
	}

	private function extractDbName(string $item_key): ?string
	{
		if (preg_match('/"([^"]+)"\]$/', $item_key, $matches) !== 1) return null;
		return $matches[1] !== '' ? $matches[1] : null;
	}

	private function toBool($value, bool $default): bool
	{
		$normalized = $this->normalizeScalar($value);
		if ($normalized === null || $normalized === '') return $default;
		return in_array(strtolower(trim($normalized)), ['1', 'true', 'yes', 'on'], true);
	}

	private function toFloat($value, float $default): float
	{
		$normalized = $this->normalizeScalar($value);
		if ($normalized === null || $normalized === '') return $default;
		return is_numeric($normalized) ? (float)$normalized : $default;
	}

	private function normalizeScalar($value): ?string
	{
		if (is_bool($value)) return $value ? '1' : '0';
		if (is_array($value)) {
			if (array_key_exists('value', $value)) {
				$nested = $value['value'];
				if (is_bool($nested)) return $nested ? '1' : '0';
				return is_scalar($nested) ? (string)$nested : null;
			}
			$first = reset($value);
			if (is_array($first) && array_key_exists('value', $first)) {
				$nested = $first['value'];
				if (is_bool($nested)) return $nested ? '1' : '0';
				if (is_scalar($nested)) return (string)$nested;
			}
			if (is_bool($first)) return $first ? '1' : '0';
			return is_scalar($first) ? (string)$first : null;
		}
		return is_scalar($value) ? (string)$value : null;
	}
}
