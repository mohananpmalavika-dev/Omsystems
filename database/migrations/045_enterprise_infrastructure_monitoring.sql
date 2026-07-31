-- Enterprise Infrastructure Monitoring
-- Comprehensive monitoring for switches, firewalls, UPS, generators, network devices, 
-- hardware telemetry, and unified health scoring

-- =====================================================
-- SWITCH MONITORING
-- =====================================================

CREATE TABLE IF NOT EXISTS network_switches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  name text NOT NULL,
  ip_address inet NOT NULL,
  mac_address macaddr,
  manufacturer text,
  model text,
  serial_number text,
  firmware_version text,
  management_protocol text CHECK (management_protocol IN ('snmp_v2c', 'snmp_v3', 'ssh', 'api', 'telnet')),
  snmp_community text,
  snmp_version text,
  port_count integer,
  poe_enabled boolean DEFAULT false,
  poe_budget_watts numeric,
  stack_member boolean DEFAULT false,
  stack_priority integer,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('online', 'offline', 'degraded', 'unknown')),
  location text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, ip_address)
);

CREATE INDEX IF NOT EXISTS network_switches_tenant_branch_idx 
  ON network_switches (tenant_id, branch_id, status);
CREATE INDEX IF NOT EXISTS network_switches_ip_idx 
  ON network_switches (ip_address);

COMMENT ON TABLE network_switches IS 
  'Inventory of network switches at each branch for enterprise monitoring';

CREATE TABLE IF NOT EXISTS switch_health_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  switch_id uuid NOT NULL REFERENCES network_switches(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  cpu_usage_percent numeric,
  memory_usage_percent numeric,
  memory_total_mb numeric,
  memory_used_mb numeric,
  temperature_celsius numeric,
  fan_status text CHECK (fan_status IN ('ok', 'warning', 'failed', 'unknown')),
  fan_rpm integer,
  power_supply_status text CHECK (power_supply_status IN ('ok', 'redundant', 'failed', 'unknown')),
  uptime_seconds bigint,
  poe_power_usage_watts numeric,
  poe_power_available_watts numeric,
  poe_utilization_percent numeric,
  total_ports integer,
  ports_up integer,
  ports_down integer,
  port_errors_total bigint,
  port_discards_total bigint,
  crc_errors_total bigint,
  broadcast_packets_total bigint,
  health_score numeric CHECK (health_score >= 0 AND health_score <= 100),
  health_status text CHECK (health_status IN ('healthy', 'warning', 'critical', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS switch_health_latest_idx 
  ON switch_health_metrics (switch_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS switch_health_status_idx 
  ON switch_health_metrics (tenant_id, health_status, observed_at DESC);

CREATE TABLE IF NOT EXISTS switch_port_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  switch_id uuid NOT NULL REFERENCES network_switches(id) ON DELETE CASCADE,
  port_number integer NOT NULL,
  port_name text,
  observed_at timestamptz NOT NULL,
  admin_status text CHECK (admin_status IN ('up', 'down', 'testing')),
  oper_status text CHECK (oper_status IN ('up', 'down', 'testing', 'unknown', 'dormant', 'notPresent', 'lowerLayerDown')),
  speed_mbps numeric,
  duplex text CHECK (duplex IN ('full', 'half', 'auto', 'unknown')),
  mtu integer,
  vlan_id integer,
  poe_enabled boolean,
  poe_power_watts numeric,
  poe_device_detected boolean,
  connected_device_type text,
  connected_device_mac macaddr,
  rx_bytes bigint,
  tx_bytes bigint,
  rx_packets bigint,
  tx_packets bigint,
  rx_errors bigint,
  tx_errors bigint,
  rx_discards bigint,
  tx_discards bigint,
  crc_errors bigint,
  collisions bigint,
  utilization_percent numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (switch_id, port_number, observed_at)
);

CREATE INDEX IF NOT EXISTS switch_port_latest_idx 
  ON switch_port_metrics (switch_id, port_number, observed_at DESC);
CREATE INDEX IF NOT EXISTS switch_port_poe_idx 
  ON switch_port_metrics (switch_id, poe_enabled, observed_at DESC);

-- =====================================================
-- FIREWALL MONITORING
-- =====================================================

CREATE TABLE IF NOT EXISTS firewalls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  name text NOT NULL,
  ip_address inet NOT NULL,
  manufacturer text,
  model text,
  serial_number text,
  firmware_version text,
  management_protocol text CHECK (management_protocol IN ('snmp', 'api', 'ssh')),
  api_endpoint text,
  high_availability boolean DEFAULT false,
  ha_role text CHECK (ha_role IN ('active', 'passive', 'standalone')),
  cluster_id text,
  license_type text,
  license_expiry_date date,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('online', 'offline', 'degraded', 'unknown')),
  location text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, ip_address)
);

CREATE INDEX IF NOT EXISTS firewalls_tenant_branch_idx 
  ON firewalls (tenant_id, branch_id, status);
CREATE INDEX IF NOT EXISTS firewalls_license_expiry_idx 
  ON firewalls (tenant_id, license_expiry_date) 
  WHERE license_expiry_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS firewall_health_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  firewall_id uuid NOT NULL REFERENCES firewalls(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  cpu_usage_percent numeric,
  memory_usage_percent numeric,
  session_count integer,
  session_utilization_percent numeric,
  session_max integer,
  threats_blocked_total bigint,
  threats_blocked_last_hour integer,
  ips_status text CHECK (ips_status IN ('enabled', 'disabled', 'bypassed')),
  av_status text CHECK (av_status IN ('enabled', 'disabled', 'outdated')),
  av_signature_version text,
  av_last_update timestamptz,
  vpn_tunnels_total integer,
  vpn_tunnels_up integer,
  vpn_tunnels_down integer,
  ha_sync_status text CHECK (ha_sync_status IN ('in_sync', 'out_of_sync', 'na')),
  interface_errors_total bigint,
  packet_drops_total bigint,
  policy_violations_total bigint,
  throughput_mbps numeric,
  health_score numeric CHECK (health_score >= 0 AND health_score <= 100),
  health_status text CHECK (health_status IN ('healthy', 'warning', 'critical', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS firewall_health_latest_idx 
  ON firewall_health_metrics (firewall_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS firewall_health_status_idx 
  ON firewall_health_metrics (tenant_id, health_status, observed_at DESC);

-- =====================================================
-- ENHANCED UPS MONITORING
-- =====================================================

CREATE TABLE IF NOT EXISTS ups_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  name text NOT NULL,
  ip_address inet,
  manufacturer text,
  model text,
  serial_number text,
  capacity_va numeric,
  capacity_watts numeric,
  battery_type text,
  battery_installation_date date,
  management_protocol text CHECK (management_protocol IN ('snmp', 'usb', 'serial', 'network_card')),
  snmp_community text,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('online', 'on_battery', 'offline', 'unknown')),
  location text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ups_devices_tenant_branch_idx 
  ON ups_devices (tenant_id, branch_id, status);
CREATE INDEX IF NOT EXISTS ups_devices_battery_age_idx 
  ON ups_devices (tenant_id, battery_installation_date) 
  WHERE battery_installation_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS ups_health_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ups_id uuid NOT NULL REFERENCES ups_devices(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  battery_health_percent numeric,
  battery_voltage numeric,
  battery_current numeric,
  battery_temperature_celsius numeric,
  battery_age_days integer,
  estimated_runtime_minutes integer,
  estimated_charge_time_minutes integer,
  utility_power_available boolean,
  running_on_battery boolean,
  input_voltage numeric,
  input_frequency numeric,
  output_voltage numeric,
  output_frequency numeric,
  output_current numeric,
  load_percent numeric,
  load_watts numeric,
  last_self_test_date timestamptz,
  last_self_test_result text CHECK (last_self_test_result IN ('passed', 'failed', 'warning', 'in_progress', 'not_available')),
  last_power_event_type text CHECK (last_power_event_type IN ('utility_fail', 'utility_restore', 'battery_low', 'shutdown', 'test')),
  last_power_event_time timestamptz,
  battery_replacement_indicator boolean DEFAULT false,
  predicted_replacement_days integer,
  alarm_status text[],
  health_score numeric CHECK (health_score >= 0 AND health_score <= 100),
  health_status text CHECK (health_status IN ('healthy', 'warning', 'critical', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ups_health_latest_idx 
  ON ups_health_metrics (ups_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS ups_health_status_idx 
  ON ups_health_metrics (tenant_id, health_status, observed_at DESC);
CREATE INDEX IF NOT EXISTS ups_on_battery_idx 
  ON ups_health_metrics (tenant_id, running_on_battery, observed_at DESC) 
  WHERE running_on_battery = true;

-- =====================================================
-- GENERATOR MONITORING
-- =====================================================

CREATE TABLE IF NOT EXISTS generators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  name text NOT NULL,
  manufacturer text,
  model text,
  serial_number text,
  capacity_kva numeric,
  fuel_type text CHECK (fuel_type IN ('diesel', 'natural_gas', 'propane', 'gasoline', 'dual_fuel')),
  fuel_tank_capacity_liters numeric,
  installation_date date,
  last_service_date date,
  next_service_date date,
  service_interval_hours integer,
  management_protocol text CHECK (management_protocol IN ('snmp', 'modbus', 'api', 'serial')),
  controller_ip inet,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('standby', 'running', 'offline', 'fault', 'unknown')),
  location text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generators_tenant_branch_idx 
  ON generators (tenant_id, branch_id, status);
CREATE INDEX IF NOT EXISTS generators_service_due_idx 
  ON generators (tenant_id, next_service_date) 
  WHERE next_service_date IS NOT NULL;

CREATE TABLE IF NOT EXISTS generator_health_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  generator_id uuid NOT NULL REFERENCES generators(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  running boolean NOT NULL,
  fuel_level_percent numeric,
  fuel_level_liters numeric,
  estimated_runtime_hours numeric,
  engine_runtime_hours numeric,
  engine_temperature_celsius numeric,
  oil_pressure_bar numeric,
  coolant_temperature_celsius numeric,
  battery_voltage numeric,
  output_voltage numeric,
  output_frequency numeric,
  output_current numeric,
  output_power_kw numeric,
  load_percent numeric,
  start_attempts integer,
  failed_starts_last_24h integer,
  last_start_time timestamptz,
  last_stop_time timestamptz,
  maintenance_due boolean DEFAULT false,
  maintenance_due_days integer,
  alarm_codes text[],
  health_score numeric CHECK (health_score >= 0 AND health_score <= 100),
  health_status text CHECK (health_status IN ('healthy', 'warning', 'critical', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS generator_health_latest_idx 
  ON generator_health_metrics (generator_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS generator_health_status_idx 
  ON generator_health_metrics (tenant_id, health_status, observed_at DESC);
CREATE INDEX IF NOT EXISTS generator_running_idx 
  ON generator_health_metrics (tenant_id, running, observed_at DESC) 
  WHERE running = true;

-- =====================================================
-- NETWORK LINK & OPTICAL MONITORING
-- =====================================================

CREATE TABLE IF NOT EXISTS network_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  name text NOT NULL,
  link_type text CHECK (link_type IN ('wan', 'mpls', 'broadband', 'fiber', 'lte', '5g', 'satellite', 'vpn')),
  provider text,
  circuit_id text,
  bandwidth_mbps numeric,
  static_ip inet,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('up', 'down', 'degraded', 'unknown')),
  primary_link boolean DEFAULT false,
  failover_priority integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS network_links_tenant_branch_idx 
  ON network_links (tenant_id, branch_id, link_type, status);
CREATE INDEX IF NOT EXISTS network_links_primary_idx 
  ON network_links (tenant_id, branch_id, primary_link) 
  WHERE primary_link = true;

CREATE TABLE IF NOT EXISTS network_link_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  link_id uuid NOT NULL REFERENCES network_links(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  link_status text CHECK (link_status IN ('up', 'down', 'degraded')),
  latency_ms numeric,
  jitter_ms numeric,
  packet_loss_percent numeric,
  bandwidth_utilization_percent numeric,
  rx_bytes_per_sec bigint,
  tx_bytes_per_sec bigint,
  rx_packets_per_sec bigint,
  tx_packets_per_sec bigint,
  rx_errors bigint,
  tx_errors bigint,
  availability_percent numeric,
  uptime_seconds bigint,
  last_down_time timestamptz,
  flap_count_24h integer,
  health_score numeric CHECK (health_score >= 0 AND health_score <= 100),
  health_status text CHECK (health_status IN ('healthy', 'warning', 'critical', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS network_link_metrics_latest_idx 
  ON network_link_metrics (link_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS network_link_metrics_status_idx 
  ON network_link_metrics (tenant_id, health_status, observed_at DESC);

CREATE TABLE IF NOT EXISTS sfp_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  switch_id uuid REFERENCES network_switches(id) ON DELETE CASCADE,
  port_number integer NOT NULL,
  module_type text CHECK (module_type IN ('sfp', 'sfp_plus', 'qsfp', 'qsfp28', 'qsfp_dd')),
  vendor text,
  part_number text,
  serial_number text,
  connector_type text CHECK (connector_type IN ('lc', 'sc', 'mpo', 'rj45')),
  wavelength_nm integer,
  max_distance_m integer,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('present', 'absent', 'faulty', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (switch_id, port_number)
);

CREATE INDEX IF NOT EXISTS sfp_modules_switch_idx 
  ON sfp_modules (switch_id, status);

CREATE TABLE IF NOT EXISTS sfp_optical_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sfp_id uuid NOT NULL REFERENCES sfp_modules(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  temperature_celsius numeric,
  voltage numeric,
  tx_bias_current_ma numeric,
  tx_power_dbm numeric,
  tx_power_mw numeric,
  rx_power_dbm numeric,
  rx_power_mw numeric,
  optical_loss_db numeric,
  link_distance_estimated_m numeric,
  alarm_temperature_high boolean DEFAULT false,
  alarm_temperature_low boolean DEFAULT false,
  alarm_tx_power_high boolean DEFAULT false,
  alarm_tx_power_low boolean DEFAULT false,
  alarm_rx_power_high boolean DEFAULT false,
  alarm_rx_power_low boolean DEFAULT false,
  health_score numeric CHECK (health_score >= 0 AND health_score <= 100),
  health_status text CHECK (health_status IN ('healthy', 'warning', 'critical', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sfp_optical_latest_idx 
  ON sfp_optical_metrics (sfp_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS sfp_optical_status_idx 
  ON sfp_optical_metrics (tenant_id, health_status, observed_at DESC);

-- =====================================================
-- VPN & SD-WAN MONITORING
-- =====================================================

CREATE TABLE IF NOT EXISTS vpn_tunnels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  firewall_id uuid REFERENCES firewalls(id) ON DELETE CASCADE,
  tunnel_name text NOT NULL,
  tunnel_type text CHECK (tunnel_type IN ('ipsec', 'ssl', 'gre', 'wireguard', 'openvpn')),
  remote_endpoint text,
  remote_branch_id uuid REFERENCES resource_nodes(id) ON DELETE SET NULL,
  local_subnet text,
  remote_subnet text,
  encryption_algorithm text,
  authentication_method text,
  preshared_key_rotation_days integer,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('up', 'down', 'negotiating', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vpn_tunnels_tenant_branch_idx 
  ON vpn_tunnels (tenant_id, branch_id, status);
CREATE INDEX IF NOT EXISTS vpn_tunnels_firewall_idx 
  ON vpn_tunnels (firewall_id, status);

CREATE TABLE IF NOT EXISTS vpn_tunnel_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  tunnel_id uuid NOT NULL REFERENCES vpn_tunnels(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  tunnel_status text CHECK (tunnel_status IN ('up', 'down', 'negotiating')),
  uptime_seconds bigint,
  bytes_in bigint,
  bytes_out bigint,
  packets_in bigint,
  packets_out bigint,
  latency_ms numeric,
  packet_loss_percent numeric,
  sla_violation boolean DEFAULT false,
  encryption_healthy boolean DEFAULT true,
  rekey_time_remaining_hours integer,
  last_rekey_time timestamptz,
  phase1_negotiation_time_ms integer,
  phase2_negotiation_time_ms integer,
  health_score numeric CHECK (health_score >= 0 AND health_score <= 100),
  health_status text CHECK (health_status IN ('healthy', 'warning', 'critical', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vpn_tunnel_metrics_latest_idx 
  ON vpn_tunnel_metrics (tunnel_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS vpn_tunnel_metrics_status_idx 
  ON vpn_tunnel_metrics (tenant_id, health_status, observed_at DESC);
CREATE INDEX IF NOT EXISTS vpn_tunnel_down_idx 
  ON vpn_tunnel_metrics (tenant_id, tunnel_status, observed_at DESC) 
  WHERE tunnel_status = 'down';

CREATE TABLE IF NOT EXISTS sdwan_paths (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  path_name text NOT NULL,
  link_id uuid REFERENCES network_links(id) ON DELETE SET NULL,
  overlay_type text CHECK (overlay_type IN ('mpls', 'internet', 'lte', '5g')),
  sla_profile text,
  sla_latency_max_ms integer,
  sla_jitter_max_ms integer,
  sla_packet_loss_max_percent numeric,
  priority integer,
  active_path boolean DEFAULT false,
  application_routing_rules jsonb,
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('active', 'standby', 'failed', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sdwan_paths_tenant_branch_idx 
  ON sdwan_paths (tenant_id, branch_id, status);
CREATE INDEX IF NOT EXISTS sdwan_paths_active_idx 
  ON sdwan_paths (tenant_id, branch_id, active_path) 
  WHERE active_path = true;

CREATE TABLE IF NOT EXISTS sdwan_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  path_id uuid NOT NULL REFERENCES sdwan_paths(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  path_status text CHECK (path_status IN ('active', 'standby', 'failed')),
  latency_ms numeric,
  jitter_ms numeric,
  packet_loss_percent numeric,
  bandwidth_utilization_percent numeric,
  sla_compliance boolean,
  sla_violation_count_24h integer,
  failover_count_24h integer,
  last_failover_time timestamptz,
  traffic_steered_percent numeric,
  application_performance_score numeric,
  health_score numeric CHECK (health_score >= 0 AND health_score <= 100),
  health_status text CHECK (health_status IN ('healthy', 'warning', 'critical', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sdwan_metrics_latest_idx 
  ON sdwan_metrics (path_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS sdwan_metrics_status_idx 
  ON sdwan_metrics (tenant_id, health_status, observed_at DESC);
CREATE INDEX IF NOT EXISTS sdwan_sla_violation_idx 
  ON sdwan_metrics (tenant_id, sla_compliance, observed_at DESC) 
  WHERE sla_compliance = false;

-- =====================================================
-- HARDWARE TELEMETRY (GPU, CPU, Voltage, PoE Details)
-- =====================================================

CREATE TABLE IF NOT EXISTS hardware_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  device_name text NOT NULL,
  device_type text CHECK (device_type IN ('recorder', 'server', 'workstation', 'appliance')),
  ip_address inet,
  manufacturer text,
  model text,
  serial_number text,
  cpu_model text,
  cpu_cores integer,
  memory_total_gb numeric,
  gpu_count integer,
  gpu_model text[],
  status text NOT NULL DEFAULT 'unknown' CHECK (status IN ('online', 'offline', 'degraded', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hardware_devices_tenant_branch_idx 
  ON hardware_devices (tenant_id, branch_id, device_type, status);

CREATE TABLE IF NOT EXISTS cpu_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES hardware_devices(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  cpu_usage_percent numeric,
  cpu_usage_per_core numeric[],
  load_average_1m numeric,
  load_average_5m numeric,
  load_average_15m numeric,
  temperature_celsius numeric,
  temperature_per_core numeric[],
  frequency_mhz numeric,
  thermal_throttling boolean DEFAULT false,
  fan_speed_rpm integer,
  fan_speed_percent numeric,
  context_switches_per_sec bigint,
  interrupts_per_sec bigint,
  health_score numeric CHECK (health_score >= 0 AND health_score <= 100),
  health_status text CHECK (health_status IN ('healthy', 'warning', 'critical', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cpu_metrics_latest_idx 
  ON cpu_metrics (device_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS cpu_metrics_status_idx 
  ON cpu_metrics (tenant_id, health_status, observed_at DESC);
CREATE INDEX IF NOT EXISTS cpu_thermal_throttle_idx 
  ON cpu_metrics (tenant_id, thermal_throttling, observed_at DESC) 
  WHERE thermal_throttling = true;

CREATE TABLE IF NOT EXISTS gpu_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  device_id uuid NOT NULL REFERENCES hardware_devices(id) ON DELETE CASCADE,
  gpu_index integer NOT NULL,
  observed_at timestamptz NOT NULL,
  gpu_name text,
  gpu_usage_percent numeric,
  memory_used_mb numeric,
  memory_total_mb numeric,
  memory_usage_percent numeric,
  temperature_celsius numeric,
  power_draw_watts numeric,
  power_limit_watts numeric,
  fan_speed_percent numeric,
  encoder_usage_percent numeric,
  decoder_usage_percent numeric,
  thermal_throttling boolean DEFAULT false,
  power_throttling boolean DEFAULT false,
  clock_graphics_mhz integer,
  clock_memory_mhz integer,
  pcie_bandwidth_utilization_percent numeric,
  ecc_errors_total bigint,
  driver_version text,
  health_score numeric CHECK (health_score >= 0 AND health_score <= 100),
  health_status text CHECK (health_status IN ('healthy', 'warning', 'critical', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gpu_metrics_latest_idx 
  ON gpu_metrics (device_id, gpu_index, observed_at DESC);
CREATE INDEX IF NOT EXISTS gpu_metrics_status_idx 
  ON gpu_metrics (tenant_id, health_status, observed_at DESC);
CREATE INDEX IF NOT EXISTS gpu_throttling_idx 
  ON gpu_metrics (tenant_id, observed_at DESC) 
  WHERE thermal_throttling = true OR power_throttling = true;

CREATE TABLE IF NOT EXISTS power_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  device_id uuid REFERENCES hardware_devices(id) ON DELETE CASCADE,
  ups_id uuid REFERENCES ups_devices(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  input_voltage numeric,
  input_current numeric,
  input_frequency numeric,
  output_voltage numeric,
  output_current numeric,
  output_frequency numeric,
  power_factor numeric,
  voltage_fluctuation_percent numeric,
  brownout_detected boolean DEFAULT false,
  overvoltage_detected boolean DEFAULT false,
  power_event_type text CHECK (power_event_type IN ('normal', 'brownout', 'overvoltage', 'sag', 'surge', 'outage')),
  power_event_count_24h integer,
  health_score numeric CHECK (health_score >= 0 AND health_score <= 100),
  health_status text CHECK (health_status IN ('healthy', 'warning', 'critical', 'unknown')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS power_metrics_latest_idx 
  ON power_metrics (branch_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS power_metrics_status_idx 
  ON power_metrics (tenant_id, health_status, observed_at DESC);
CREATE INDEX IF NOT EXISTS power_events_idx 
  ON power_metrics (tenant_id, power_event_type, observed_at DESC) 
  WHERE power_event_type != 'normal';

-- =====================================================
-- NETWORK TOPOLOGY
-- =====================================================

CREATE TABLE IF NOT EXISTS network_topology (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  source_device_type text NOT NULL CHECK (source_device_type IN ('switch', 'firewall', 'router', 'recorder', 'camera', 'ups', 'server')),
  source_device_id uuid NOT NULL,
  source_interface text,
  target_device_type text NOT NULL CHECK (target_device_type IN ('switch', 'firewall', 'router', 'recorder', 'camera', 'ups', 'server', 'internet')),
  target_device_id uuid,
  target_interface text,
  connection_type text CHECK (connection_type IN ('physical', 'logical', 'power', 'management')),
  discovered_via text CHECK (discovered_via IN ('lldp', 'cdp', 'arp', 'mac_table', 'manual', 'snmp')),
  last_seen timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS network_topology_source_idx 
  ON network_topology (tenant_id, branch_id, source_device_type, source_device_id);
CREATE INDEX IF NOT EXISTS network_topology_target_idx 
  ON network_topology (tenant_id, branch_id, target_device_type, target_device_id);
CREATE INDEX IF NOT EXISTS network_topology_branch_idx 
  ON network_topology (branch_id, last_seen DESC);

COMMENT ON TABLE network_topology IS 
  'Network topology graph showing physical and logical connections between infrastructure devices';

-- =====================================================
-- UNIFIED INFRASTRUCTURE HEALTH SCORING
-- =====================================================

CREATE TABLE IF NOT EXISTS infrastructure_health_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  observed_at timestamptz NOT NULL,
  overall_score numeric CHECK (overall_score >= 0 AND overall_score <= 100),
  overall_status text CHECK (overall_status IN ('healthy', 'warning', 'critical', 'unknown')),
  power_score numeric CHECK (power_score >= 0 AND power_score <= 100),
  power_status text CHECK (power_status IN ('healthy', 'warning', 'critical', 'unknown')),
  network_score numeric CHECK (network_score >= 0 AND network_score <= 100),
  network_status text CHECK (network_status IN ('healthy', 'warning', 'critical', 'unknown')),
  compute_score numeric CHECK (compute_score >= 0 AND compute_score <= 100),
  compute_status text CHECK (compute_status IN ('healthy', 'warning', 'critical', 'unknown')),
  storage_score numeric CHECK (storage_score >= 0 AND storage_score <= 100),
  storage_status text CHECK (storage_status IN ('healthy', 'warning', 'critical', 'unknown')),
  cooling_score numeric CHECK (cooling_score >= 0 AND cooling_score <= 100),
  cooling_status text CHECK (cooling_status IN ('healthy', 'warning', 'critical', 'unknown')),
  security_score numeric CHECK (security_score >= 0 AND security_score <= 100),
  security_status text CHECK (security_status IN ('healthy', 'warning', 'critical', 'unknown')),
  surveillance_score numeric CHECK (surveillance_score >= 0 AND surveillance_score <= 100),
  surveillance_status text CHECK (surveillance_status IN ('healthy', 'warning', 'critical', 'unknown')),
  component_details jsonb,
  critical_issues integer DEFAULT 0,
  warning_issues integer DEFAULT 0,
  predicted_failures integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS infrastructure_health_latest_idx 
  ON infrastructure_health_scores (branch_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS infrastructure_health_status_idx 
  ON infrastructure_health_scores (tenant_id, overall_status, observed_at DESC);
CREATE INDEX IF NOT EXISTS infrastructure_health_critical_idx 
  ON infrastructure_health_scores (tenant_id, observed_at DESC) 
  WHERE critical_issues > 0;

COMMENT ON TABLE infrastructure_health_scores IS 
  'Unified infrastructure health scores across all domains: power, network, compute, storage, cooling, security, surveillance';

CREATE TABLE IF NOT EXISTS infrastructure_availability_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  period_type text CHECK (period_type IN ('hour', 'day', 'week', 'month')),
  total_uptime_seconds bigint,
  total_downtime_seconds bigint,
  availability_percent numeric,
  power_outage_count integer,
  power_outage_duration_seconds bigint,
  network_outage_count integer,
  network_outage_duration_seconds bigint,
  compute_failure_count integer,
  storage_failure_count integer,
  mtbf_hours numeric,
  mttr_hours numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, branch_id, period_start, period_type)
);

CREATE INDEX IF NOT EXISTS infrastructure_availability_branch_idx 
  ON infrastructure_availability_metrics (branch_id, period_type, period_start DESC);
CREATE INDEX IF NOT EXISTS infrastructure_availability_tenant_idx 
  ON infrastructure_availability_metrics (tenant_id, period_type, period_start DESC);

COMMENT ON TABLE infrastructure_availability_metrics IS 
  'Time-series availability metrics for infrastructure components aggregated by hour/day/week/month';

-- =====================================================
-- INFRASTRUCTURE ALERTS & EVENTS
-- =====================================================

CREATE TABLE IF NOT EXISTS infrastructure_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  branch_id uuid NOT NULL REFERENCES resource_nodes(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical', 'warning', 'info')),
  component_type text NOT NULL CHECK (component_type IN 
    ('switch', 'firewall', 'ups', 'generator', 'network_link', 'vpn', 'sdwan', 
     'sfp', 'cpu', 'gpu', 'power', 'recorder', 'camera', 'storage', 'infrastructure')),
  component_id uuid,
  component_name text,
  title text NOT NULL,
  description text,
  impact text,
  recommended_action text,
  metrics jsonb,
  threshold_violated text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'acknowledged', 'resolved', 'suppressed')),
  detected_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  resolution_notes text,
  auto_resolved boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS infrastructure_alerts_tenant_idx 
  ON infrastructure_alerts (tenant_id, status, severity, detected_at DESC);
CREATE INDEX IF NOT EXISTS infrastructure_alerts_branch_idx 
  ON infrastructure_alerts (branch_id, status, detected_at DESC);
CREATE INDEX IF NOT EXISTS infrastructure_alerts_component_idx 
  ON infrastructure_alerts (component_type, component_id, status);
CREATE INDEX IF NOT EXISTS infrastructure_alerts_active_idx 
  ON infrastructure_alerts (tenant_id, detected_at DESC) 
  WHERE status = 'active';

COMMENT ON TABLE infrastructure_alerts IS 
  'Infrastructure monitoring alerts for all enterprise devices and systems';

-- =====================================================
-- VIEWS FOR INFRASTRUCTURE MONITORING
-- =====================================================

CREATE OR REPLACE VIEW infrastructure_device_summary AS
SELECT 
  b.id as branch_id,
  b.tenant_id,
  b.name as branch_name,
  COUNT(DISTINCT ns.id) as switch_count,
  COUNT(DISTINCT ns.id) FILTER (WHERE ns.status = 'online') as switches_online,
  COUNT(DISTINCT fw.id) as firewall_count,
  COUNT(DISTINCT fw.id) FILTER (WHERE fw.status = 'online') as firewalls_online,
  COUNT(DISTINCT ud.id) as ups_count,
  COUNT(DISTINCT ud.id) FILTER (WHERE ud.status = 'online') as ups_online,
  COUNT(DISTINCT g.id) as generator_count,
  COUNT(DISTINCT g.id) FILTER (WHERE g.status = 'standby' OR g.status = 'running') as generators_ready,
  COUNT(DISTINCT nl.id) as network_link_count,
  COUNT(DISTINCT nl.id) FILTER (WHERE nl.status = 'up') as network_links_up,
  COUNT(DISTINCT vt.id) as vpn_tunnel_count,
  COUNT(DISTINCT vt.id) FILTER (WHERE vt.status = 'up') as vpn_tunnels_up,
  COUNT(DISTINCT hd.id) as hardware_device_count,
  COUNT(DISTINCT hd.id) FILTER (WHERE hd.status = 'online') as hardware_devices_online
FROM resource_nodes b
LEFT JOIN network_switches ns ON ns.branch_id = b.id
LEFT JOIN firewalls fw ON fw.branch_id = b.id
LEFT JOIN ups_devices ud ON ud.branch_id = b.id
LEFT JOIN generators g ON g.branch_id = b.id
LEFT JOIN network_links nl ON nl.branch_id = b.id
LEFT JOIN vpn_tunnels vt ON vt.branch_id = b.id
LEFT JOIN hardware_devices hd ON hd.branch_id = b.id
WHERE b.type = 'branch'
GROUP BY b.id, b.tenant_id, b.name;

COMMENT ON VIEW infrastructure_device_summary IS 
  'Summary count of all infrastructure devices per branch';

CREATE OR REPLACE VIEW infrastructure_critical_status AS
SELECT 
  ia.tenant_id,
  ia.branch_id,
  b.name as branch_name,
  ia.component_type,
  ia.component_name,
  ia.severity,
  ia.title,
  ia.detected_at,
  ia.status,
  EXTRACT(EPOCH FROM (NOW() - ia.detected_at))/3600 as hours_active
FROM infrastructure_alerts ia
JOIN resource_nodes b ON b.id = ia.branch_id
WHERE ia.status = 'active' 
  AND ia.severity IN ('critical', 'warning')
ORDER BY 
  CASE ia.severity 
    WHEN 'critical' THEN 1 
    WHEN 'warning' THEN 2 
    ELSE 3 
  END,
  ia.detected_at DESC;

COMMENT ON VIEW infrastructure_critical_status IS 
  'Active critical and warning infrastructure alerts requiring attention';

-- =====================================================
-- FUNCTIONS
-- =====================================================

-- Function to calculate infrastructure health score for a branch
CREATE OR REPLACE FUNCTION calculate_infrastructure_health_score(
  p_tenant_id uuid,
  p_branch_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_power_score numeric := 0;
  v_network_score numeric := 0;
  v_compute_score numeric := 0;
  v_storage_score numeric := 0;
  v_cooling_score numeric := 0;
  v_security_score numeric := 0;
  v_surveillance_score numeric := 0;
  v_overall_score numeric := 0;
  v_result jsonb;
BEGIN
  -- Calculate power score (UPS + Generator + Power quality)
  SELECT COALESCE(AVG(health_score), 0) INTO v_power_score
  FROM (
    SELECT health_score FROM ups_health_metrics uhm
    JOIN ups_devices ud ON ud.id = uhm.ups_id
    WHERE ud.tenant_id = p_tenant_id AND ud.branch_id = p_branch_id
    AND uhm.observed_at > NOW() - INTERVAL '15 minutes'
    UNION ALL
    SELECT health_score FROM generator_health_metrics ghm
    JOIN generators g ON g.id = ghm.generator_id
    WHERE g.tenant_id = p_tenant_id AND g.branch_id = p_branch_id
    AND ghm.observed_at > NOW() - INTERVAL '15 minutes'
    UNION ALL
    SELECT health_score FROM power_metrics pm
    WHERE pm.tenant_id = p_tenant_id AND pm.branch_id = p_branch_id
    AND pm.observed_at > NOW() - INTERVAL '15 minutes'
  ) power_metrics;

  -- Calculate network score (Switches + Firewalls + Links + VPN + SD-WAN)
  SELECT COALESCE(AVG(health_score), 0) INTO v_network_score
  FROM (
    SELECT health_score FROM switch_health_metrics shm
    JOIN network_switches ns ON ns.id = shm.switch_id
    WHERE ns.tenant_id = p_tenant_id AND ns.branch_id = p_branch_id
    AND shm.observed_at > NOW() - INTERVAL '15 minutes'
  ) network_metrics;

  v_result := jsonb_build_object(
    'power_score', v_power_score,
    'network_score', v_network_score,
    'compute_score', v_compute_score,
    'storage_score', v_storage_score,
    'cooling_score', v_cooling_score,
    'security_score', v_security_score,
    'surveillance_score', v_surveillance_score,
    'overall_score', (v_power_score + v_network_score + v_compute_score + 
                      v_storage_score + v_cooling_score + v_security_score + 
                      v_surveillance_score) / 7
  );

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_infrastructure_health_score IS 
  'Calculate comprehensive infrastructure health score across all domains';

-- =====================================================
-- COMMENTS
-- =====================================================

COMMENT ON COLUMN network_switches.poe_budget_watts IS 
  'Total PoE power budget in watts for the switch';
COMMENT ON COLUMN switch_port_metrics.poe_power_watts IS 
  'Current PoE power draw on this port in watts';
COMMENT ON COLUMN firewall_health_metrics.session_count IS 
  'Current active firewall sessions';
COMMENT ON COLUMN ups_health_metrics.predicted_replacement_days IS 
  'AI-predicted days until battery replacement needed';
COMMENT ON COLUMN generator_health_metrics.maintenance_due_days IS 
  'Days until scheduled maintenance is due';
COMMENT ON COLUMN sfp_optical_metrics.optical_loss_db IS 
  'Calculated fiber optic signal loss in dB';
COMMENT ON COLUMN vpn_tunnel_metrics.sla_violation IS 
  'True if tunnel metrics violate defined SLA thresholds';
COMMENT ON COLUMN gpu_metrics.ecc_errors_total IS 
  'Total GPU ECC (Error Correction Code) errors detected';
COMMENT ON COLUMN infrastructure_health_scores.component_details IS 
  'JSON object containing detailed breakdown of health scores by individual components';
