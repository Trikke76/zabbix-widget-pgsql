<?php

declare(strict_types = 1);

namespace Modules\PgsqlClusterWidget\Actions;

use API;
use CControllerDashboardWidgetView;
use CControllerResponseData;

class WidgetView extends CControllerDashboardWidgetView {

	private const METRICS = [
		'pgsql.db.size[' => 'db_size',
		'pgsql.dbstat.numbackends[' => 'backends',
		'pgsql.dbstat.temp_bytes.rate[' => 'temp_bytes_rate',
		'pgsql.dbstat.xact_commit.rate[' => 'commit_rate',
		'pgsql.dbstat.xact_rollback.rate[' => 'rollback_rate',
		'pgsql.dbstat.deadlocks.rate[' => 'deadlocks_rate',
		'pgsql.locks.total[' => 'locks_total',
		'pgsql.queries.query.slow_count[' => 'slow_queries'
	];
	private const CLUSTER_METRICS = [
		'pgsql.connections.sum.active' => 'active_connections',
		'pgsql.wal.write' => 'wal_write',
		'pgsql.wal.receive' => 'wal_receive',
		'pgsql.wal.count' => 'wal_count'
	];

	protected function doAction(): void {
		try {
			$fields = $this->fields_values;
			$show_optional = $this->toBool($fields['show_optional'] ?? 1, true);
			$cpu_warn_threshold = $this->toFloat($fields['cpu_warn_threshold'] ?? 1.00, 1.00);
			$cpu_high_threshold = $this->toFloat($fields['cpu_high_threshold'] ?? 2.00, 2.00);
			$hostid = $this->extractHostId($fields['hostids'] ?? null);
			$discovery_itemid = $this->extractItemId($fields['discovery_itemid'] ?? null);

			if ($hostid === null && $discovery_itemid === null) {
				$this->setResponse(new CControllerResponseData([
					'name' => $this->widget->getDefaultName(),
					'databases' => [],
					'error' => _('Select a host first.'),
					'default_db' => $fields['default_db'] ?? '',
					'show_optional' => $show_optional,
					'icon_url' => 'modules/pgsql_cluster_widget/assets/img/postgres-icon-24.svg',
					'user' => [
						'debug_mode' => $this->getDebugMode()
					]
				]));
				return;
			}

			if ($discovery_itemid !== null) {
				$discovery_item = API::Item()->get([
					'output' => ['itemid', 'hostid', 'name', 'key_'],
					'itemids' => [$discovery_itemid],
					'webitems' => true
				]);

				if ($discovery_item) {
					$hostid = (string) $discovery_item[0]['hostid'];
					$discovery_itemid = (string) $discovery_item[0]['itemid'];
				}
				else {
					$discovery_itemid = null;
				}
			}
			else {
				$discovery_itemid = $this->findDiscoveryItemIdByHost($hostid);
			}

			$discovered_db_names = $discovery_itemid !== null
				? $this->getDiscoveredDatabases($discovery_itemid)
				: [];
			$metrics_by_db = $this->getMetricsByDatabase($hostid);
			$cluster_metrics = $this->getClusterMetrics($hostid);
			$host_metrics = $this->getHostMetrics($hostid, $fields);
			$visibility = $this->buildVisibility($fields);
			$visible_metric_keys = $this->buildVisibleMetricKeys($visibility);
			$visible_host_metric_keys = $this->buildVisibleHostMetricKeys($visibility);

			if (!$discovered_db_names) {
				$discovered_db_names = array_keys($metrics_by_db);
				sort($discovered_db_names);
			}

			$databases = [];
			foreach ($discovered_db_names as $db_name) {
				$databases[] = [
					'name' => $db_name,
					'metrics' => $metrics_by_db[$db_name] ?? []
				];
			}

			$this->setResponse(new CControllerResponseData([
				'name' => $this->widget->getDefaultName(),
				'databases' => $databases,
				'cluster_metrics' => $cluster_metrics,
				'host_metrics' => $host_metrics,
				'visibility' => $visibility,
				'visible_metric_keys' => $visible_metric_keys,
				'visible_host_metric_keys' => $visible_host_metric_keys,
				'cpu_warn_threshold' => $cpu_warn_threshold,
				'cpu_high_threshold' => $cpu_high_threshold,
				'default_db' => $fields['default_db'] ?? '',
				'show_optional' => $show_optional,
				'error' => null,
				'icon_url' => 'modules/pgsql_cluster_widget/assets/img/postgres-icon-24.svg',
				'user' => [
					'debug_mode' => $this->getDebugMode()
				]
			]));
		}
		catch (\Throwable $e) {
			$this->setErrorResponse(sprintf('View action error: %s', $e->getMessage()));
		}
	}

	private function setErrorResponse(string $message): void {
		$this->setResponse(new CControllerResponseData([
			'name' => $this->widget->getDefaultName(),
			'databases' => [],
			'cluster_metrics' => [],
			'host_metrics' => [],
			'visibility' => [],
			'visible_metric_keys' => [],
			'visible_host_metric_keys' => [],
			'cpu_warn_threshold' => 1.00,
			'cpu_high_threshold' => 2.00,
			'error' => $message,
			'default_db' => '',
			'show_optional' => true,
			'icon_url' => 'modules/pgsql_cluster_widget/assets/img/postgres-icon-24.svg',
			'user' => [
				'debug_mode' => $this->getDebugMode()
			]
		]));
	}

	private function extractItemId($value): ?string {
		if (is_array($value) && $value) {
			$first = reset($value);
			if (is_array($first) && array_key_exists('itemid', $first)) {
				return (string) $first['itemid'];
			}
			return (string) $first;
		}

		if (is_scalar($value) && (string) $value !== '') {
			$itemid = trim((string) $value);
			return $itemid !== '' ? $itemid : null;
		}

		return null;
	}

	private function extractHostId($value): ?string {
		if (is_array($value) && $value) {
			$first = reset($value);
			if (is_array($first) && array_key_exists('hostid', $first)) {
				return (string) $first['hostid'];
			}
			return (string) $first;
		}

		if (is_scalar($value) && (string) $value !== '') {
			$hostid = trim((string) $value);
			return $hostid !== '' ? $hostid : null;
		}

		return null;
	}

	private function findDiscoveryItemIdByHost(string $hostid): ?string {
		$rules = API::DiscoveryRule()->get([
			'output' => ['itemid', 'key_'],
			'hostids' => [$hostid],
			'search' => ['key_' => 'pgsql.db.discovery'],
			'searchByAny' => true,
			'sortfield' => 'itemid',
			'sortorder' => ZBX_SORT_DOWN,
			'limit' => 1,
			'inherited' => true
		]);

		if (!$rules) {
			return null;
		}

		return (string) $rules[0]['itemid'];
	}

	private function getDiscoveredDatabases(string $discovery_itemid): array {
		$history = API::History()->get([
			'output' => ['value'],
			'history' => ITEM_VALUE_TYPE_TEXT,
			'itemids' => [$discovery_itemid],
			'sortfield' => 'clock',
			'sortorder' => ZBX_SORT_DOWN,
			'limit' => 1
		]);

		if (!$history) {
			return [];
		}

		$raw = json_decode($history[0]['value'], true);
		if (!is_array($raw)) {
			return [];
		}

		$rows = $raw['data'] ?? $raw;
		if (!is_array($rows)) {
			return [];
		}

		$db_names = [];
		foreach ($rows as $row) {
			if (is_array($row) && array_key_exists('{#DBNAME}', $row) && $row['{#DBNAME}'] !== '') {
				$db_names[] = (string) $row['{#DBNAME}'];
			}
		}

		$db_names = array_values(array_unique($db_names));
		sort($db_names);

		return $db_names;
	}

	private function getMetricsByDatabase(string $hostid): array {
		$items = API::Item()->get([
			'output' => ['itemid', 'name', 'key_', 'units', 'lastvalue'],
			'hostids' => [$hostid],
			'monitored' => true,
			'webitems' => true
		]);

		$result = [];

		foreach ($items as $item) {
			$key = $item['key_'];
			$metric_key = null;

			foreach (self::METRICS as $prefix => $label) {
				if (strpos($key, $prefix) === 0) {
					$metric_key = $label;
					break;
				}
			}

			if ($metric_key === null) {
				continue;
			}

			$db_name = $this->extractDbName($key);
			if ($db_name === null) {
				continue;
			}

			if (!array_key_exists($db_name, $result)) {
				$result[$db_name] = [];
			}

			$result[$db_name][$metric_key] = [
				'label' => $item['name'],
				'value' => $item['lastvalue'],
				'units' => $item['units']
			];
		}

		return $result;
	}

	private function getClusterMetrics(string $hostid): array {
		$items = API::Item()->get([
			'output' => ['name', 'key_', 'units', 'lastvalue'],
			'hostids' => [$hostid],
			'monitored' => true,
			'webitems' => true
		]);

		$result = [];

		foreach ($items as $item) {
			$key = $item['key_'];
			if (!array_key_exists($key, self::CLUSTER_METRICS)) {
				continue;
			}

			$result[self::CLUSTER_METRICS[$key]] = [
				'label' => $item['name'],
				'value' => $item['lastvalue'],
				'units' => $item['units']
			];
		}

		return $result;
	}

	private function getHostMetrics(string $hostid, array $fields): array {
		$config = [
			'host_cpu_load_avg1_key' => [
				'default_key' => 'system.cpu.load[all,avg1]',
				'label' => 'Host CPU load (avg1)'
			],
			'host_cpu_load_avg5_key' => [
				'default_key' => 'system.cpu.load[all,avg5]',
				'label' => 'Host CPU load (avg5)'
			],
			'host_cpu_load_avg15_key' => [
				'default_key' => 'system.cpu.load[all,avg15]',
				'label' => 'Host CPU load (avg15)'
			],
			'host_memory_total_key' => [
				'default_key' => 'vm.memory.size[total]',
				'label' => 'Host memory total'
			],
			'host_memory_available_key' => [
				'default_key' => 'vm.memory.size[available]',
				'label' => 'Host memory available'
			]
		];

		$keys_to_find = [];
		$key_to_alias = [];

		foreach ($config as $field_name => $row) {
			$key = trim((string) ($fields[$field_name] ?? $row['default_key']));
			if ($key === '') {
				continue;
			}

			$keys_to_find[] = $key;
			$key_to_alias[$key] = $field_name;
		}

		if (!$keys_to_find) {
			return [];
		}

		$items = API::Item()->get([
			'output' => ['name', 'key_', 'units', 'lastvalue'],
			'hostids' => [$hostid],
			'monitored' => true,
			'webitems' => true
		]);

		$result = [];
		foreach ($items as $item) {
			$key = $item['key_'];
			if (!array_key_exists($key, $key_to_alias)) {
				continue;
			}

			$alias = $key_to_alias[$key];
			$result[$alias] = [
				'label' => $config[$alias]['label'],
				'value' => $item['lastvalue'],
				'units' => $item['units']
			];
		}

		return $result;
	}

	private function buildVisibility(array $fields): array {
		$keys = [
			'show_host_cpu_avg1', 'show_host_cpu_avg5', 'show_host_cpu_avg15', 'show_host_mem_total',
			'show_host_mem_available', 'show_active_connections', 'show_wal_write', 'show_wal_receive',
			'show_wal_count', 'show_db_size', 'show_backends', 'show_temp_bytes', 'show_commit_rate',
			'show_rollback_rate', 'show_locks_total', 'show_deadlocks_rate', 'show_slow_queries'
		];

		$result = [];
		foreach ($keys as $key) {
			$result[$key] = $this->toBool($fields[$key] ?? 1, true);
		}

		return $result;
	}

	private function buildVisibleMetricKeys(array $visibility): array {
		$map = [
			'active_connections' => 'show_active_connections',
			'wal_write' => 'show_wal_write',
			'wal_receive' => 'show_wal_receive',
			'wal_count' => 'show_wal_count',
			'db_size' => 'show_db_size',
			'backends' => 'show_backends',
			'temp_bytes_rate' => 'show_temp_bytes',
			'commit_rate' => 'show_commit_rate',
			'rollback_rate' => 'show_rollback_rate',
			'locks_total' => 'show_locks_total',
			'deadlocks_rate' => 'show_deadlocks_rate',
			'slow_queries' => 'show_slow_queries'
		];

		$result = [];
		foreach ($map as $metric_key => $visibility_key) {
			if (!array_key_exists($visibility_key, $visibility) || $visibility[$visibility_key]) {
				$result[] = $metric_key;
			}
		}

		return $result;
	}

	private function buildVisibleHostMetricKeys(array $visibility): array {
		$map = [
			'host_cpu_load_avg1_key' => 'show_host_cpu_avg1',
			'host_cpu_load_avg5_key' => 'show_host_cpu_avg5',
			'host_cpu_load_avg15_key' => 'show_host_cpu_avg15',
			'host_memory_total_key' => 'show_host_mem_total',
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

	private function toBool($value, bool $default): bool {
		$normalized = $this->normalizeScalar($value);
		if ($normalized === null || $normalized === '') {
			return $default;
		}

		$v = strtolower(trim($normalized));
		return in_array($v, ['1', 'true', 'yes', 'on'], true);
	}

	private function toFloat($value, float $default): float {
		$normalized = $this->normalizeScalar($value);
		if ($normalized === null || $normalized === '') {
			return $default;
		}

		return is_numeric($normalized) ? (float) $normalized : $default;
	}

	private function normalizeScalar($value): ?string {
		if (is_bool($value)) {
			return $value ? '1' : '0';
		}

		if (is_array($value)) {
			if (array_key_exists('value', $value)) {
				$nested = $value['value'];
				if (is_bool($nested)) {
					return $nested ? '1' : '0';
				}
				return is_scalar($nested) ? (string) $nested : null;
			}

			$first = reset($value);
			if (is_array($first) && array_key_exists('value', $first)) {
				$nested = $first['value'];
				if (is_bool($nested)) {
					return $nested ? '1' : '0';
				}
				if (is_scalar($nested)) {
					return (string) $nested;
				}
			}

			if (is_bool($first)) {
				return $first ? '1' : '0';
			}

			return is_scalar($first) ? (string) $first : null;
		}

		return is_scalar($value) ? (string) $value : null;
	}

	private function extractDbName(string $item_key): ?string {
		if (preg_match('/"([^"]+)"\]$/', $item_key, $matches) !== 1) {
			return null;
		}

		return $matches[1] !== '' ? $matches[1] : null;
	}
}
