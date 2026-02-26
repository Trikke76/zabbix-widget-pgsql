<?php

declare(strict_types = 1);

/** @var array $data */

$asset_base = 'modules/' . basename(dirname(__DIR__)) . '/assets';

$payload = [
	'databases'                => $data['databases'] ?? [],
	'cluster_metrics'          => $data['cluster_metrics'] ?? [],
	'host_metrics'             => $data['host_metrics'] ?? [],
	'visibility'               => $data['visibility'] ?? [],
	'visible_metric_keys'      => $data['visible_metric_keys'] ?? [],
	'visible_host_metric_keys' => $data['visible_host_metric_keys'] ?? [],
	'cpu_warn_threshold'       => $data['cpu_warn_threshold'] ?? 1.00,
	'cpu_high_threshold'       => $data['cpu_high_threshold'] ?? 2.00,
	'default_db'               => $data['default_db'] ?? '',
	'zabbix_base_url'          => $data['zabbix_base_url'] ?? '',
	'graph_period'             => $data['graph_period'] ?? '86400',
	'error'                    => $data['error'] ?? null,
	'icon_url'                 => $asset_base . '/img/postgres-icon-24.svg'
];

$root = (new CDiv())
	->addClass('pgdb-widget js-pgdb-widget')
	->setAttribute('data-model', json_encode($payload, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT));

$header = (new CDiv())->addClass('pgdb-widget__header');
$visual = (new CDiv())->addClass('pgdb-widget__visual');

// Load SVG directly; JS will swap to PNG if it exists (PNG preferred, SVG fallback)
$icon = (new CTag('img'))
	->addClass('pgdb-widget__icon js-pgdb-icon')
	->setAttribute('src', $asset_base . '/img/postgres-icon-24.svg')
	->setAttribute('data-png-src', $asset_base . '/img/postgres-icon-24.png')
	->setAttribute('alt', 'PostgreSQL')
	->setAttribute('loading', 'eager');

$rings = (new CTag('ul', true))
	->addClass('pgdb-widget__rings js-pgdb-rings');

$pgtune = (new CTag('a', true, '🔧 pgtune'))
	->setAttribute('href', 'https://pgtune.leopard.in.ua/')
	->setAttribute('target', '_blank')
	->setAttribute('rel', 'noopener noreferrer')
	->addClass('pgdb-widget__pgtune-link');

$health = (new CDiv())->addClass('pgdb-widget__health js-pgdb-health');
$visual->addItem([$icon, $rings, $health, $pgtune]);

$host_metrics = (new CDiv())->addClass('pgdb-widget__host-metrics js-pgdb-host-metrics');
$header->addItem([$visual, $host_metrics]);

$error = (new CDiv())->addClass('pgdb-widget__error js-pgdb-error');
$cards = (new CDiv())->addClass('pgdb-widget__cards js-pgdb-cards');

$root->addItem([$header, $error, $cards]);

$view = new CWidgetView($data);
$view->addItem($root);
$view->show();
