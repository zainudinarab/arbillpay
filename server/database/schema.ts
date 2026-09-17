import { pool } from '../config/db.js';

export async function initDatabaseSchema() {
  try {
    console.log('🔄 Initializing robust PostgreSQL database schema...');

    // 0. Ensure all base tables exist with complete structure
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(64) PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255),
        password_hash VARCHAR(255),
        name VARCHAR(255),
        email VARCHAR(255),
        phone_number VARCHAR(64),
        arabpay_user_id VARCHAR(64),
        arabpay_token TEXT,
        role VARCHAR(32) DEFAULT 'teknisi',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS routers (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        ip_address VARCHAR(64) NOT NULL,
        api_port INT DEFAULT 8728,
        username VARCHAR(64) DEFAULT 'admin',
        password VARCHAR(255) DEFAULT '',
        dns_name VARCHAR(255) DEFAULT 'arab.net',
        hotspot_ip VARCHAR(64) DEFAULT '10.0.0.1',
        status VARCHAR(32) DEFAULT 'online',
        last_synced TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS packages (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(32) NOT NULL DEFAULT 'pppoe',
        price NUMERIC(12, 2) NOT NULL DEFAULT 0,
        speed_limit VARCHAR(64) DEFAULT '10M/10M',
        validity_iso VARCHAR(64) DEFAULT 'P1M',
        grace_period_iso VARCHAR(64) DEFAULT 'P5D',
        only_one_user BOOLEAN DEFAULT false,
        uptime_limit VARCHAR(64),
        quota_mb INT,
        mikrotik_profile VARCHAR(64) DEFAULT 'default',
        shared_users INT DEFAULT 1,
        lock_server BOOLEAN DEFAULT false,
        expired_mode VARCHAR(32) DEFAULT 'rem',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS router_profiles (
        id VARCHAR(64) PRIMARY KEY,
        router_id VARCHAR(64) REFERENCES routers(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(32) NOT NULL DEFAULT 'pppoe',
        rate_limit VARCHAR(64),
        package_id VARCHAR(64) REFERENCES packages(id) ON DELETE SET NULL,
        local_address_mode VARCHAR(32) DEFAULT 'manual',
        local_address VARCHAR(64),
        remote_address VARCHAR(64),
        parent_queue VARCHAR(255),
        dns_server VARCHAR(255),
        is_synced BOOLEAN DEFAULT false,
        on_router BOOLEAN DEFAULT false,
        is_active BOOLEAN DEFAULT true,
        synced_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ip_pools (
        id VARCHAR(64) PRIMARY KEY,
        router_id VARCHAR(64) REFERENCES routers(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        gateway VARCHAR(64),
        ranges VARCHAR(255) NOT NULL,
        total_ip INT DEFAULT 253,
        subnet VARCHAR(32) DEFAULT '/24',
        is_synced BOOLEAN DEFAULT false,
        on_router BOOLEAN DEFAULT false,
        synced_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS customers (
        id VARCHAR(64) PRIMARY KEY,
        user_id VARCHAR(64),
        customer_code VARCHAR(64) UNIQUE,
        name VARCHAR(255) NOT NULL,
        phone_number VARCHAR(64),
        address TEXT,
        connection_type VARCHAR(32) NOT NULL DEFAULT 'pppoe',
        dusun VARCHAR(255),
        desa VARCHAR(255),
        kecamatan VARCHAR(255),
        kabupaten VARCHAR(255),
        provinsi VARCHAR(255),
        pppoe_username VARCHAR(255),
        pppoe_password VARCHAR(255),
        static_ip VARCHAR(64),
        installation_date DATE,
        expired_at DATE,
        grace_until DATE,
        odp_port VARCHAR(32),
        sn_onu VARCHAR(64),
        power_laser NUMERIC(6, 2),
        teknisi VARCHAR(255),
        is_synced BOOLEAN DEFAULT false,
        mikrotik_id VARCHAR(64),
        latitude NUMERIC(10, 8),
        longitude NUMERIC(11, 8),
        maps_url TEXT,
        package_id VARCHAR(64) REFERENCES packages(id) ON DELETE SET NULL,
        custom_price NUMERIC(12, 2),
        router_id VARCHAR(64) REFERENCES routers(id) ON DELETE SET NULL,
        router_profile_id VARCHAR(64) REFERENCES router_profiles(id) ON DELETE SET NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS hotspot_vouchers (
        id VARCHAR(64) PRIMARY KEY,
        batch_id VARCHAR(64),
        router_id VARCHAR(64) REFERENCES routers(id) ON DELETE SET NULL,
        router_profile_id VARCHAR(64) REFERENCES router_profiles(id) ON DELETE SET NULL,
        invoice_id VARCHAR(64),
        invoice_number VARCHAR(64),
        code VARCHAR(64) NOT NULL,
        password VARCHAR(64) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'active',
        is_synced BOOLEAN DEFAULT false,
        last_synced_at TIMESTAMP WITH TIME ZONE,
        sync_error TEXT,
        first_login_at TIMESTAMP WITH TIME ZONE,
        mac_address VARCHAR(64),
        ip_address VARCHAR(64),
        expired_at TIMESTAMP WITH TIME ZONE,
        comment TEXT,
        sold_to VARCHAR(255),
        sold_at TIMESTAMP WITH TIME ZONE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS system_settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS invoices (
        id VARCHAR(64) PRIMARY KEY,
        invoice_number VARCHAR(64) UNIQUE NOT NULL,
        customer_id VARCHAR(64) REFERENCES customers(id) ON DELETE SET NULL,
        user_id VARCHAR(64),
        voucher_id VARCHAR(64),
        voucher_code VARCHAR(64),
        customer_name VARCHAR(255),
        customer_phone VARCHAR(64),
        connection_type VARCHAR(32) NOT NULL DEFAULT 'pppoe',
        package_name VARCHAR(255),
        amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
        total NUMERIC(12, 2) NOT NULL DEFAULT 0,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        issue_date DATE DEFAULT CURRENT_DATE,
        due_date DATE,
        paid_at TIMESTAMP WITH TIME ZONE,
        payment_method VARCHAR(64),
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS flash_sales (
        id VARCHAR(64) PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        subtitle TEXT,
        badge_label VARCHAR(64) DEFAULT 'FLASH SALE',
        discount_text VARCHAR(255),
        router_id VARCHAR(64) REFERENCES routers(id) ON DELETE SET NULL,
        target_package_id VARCHAR(64),
        target_package_name VARCHAR(255),
        original_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
        promo_price NUMERIC(12, 2) NOT NULL DEFAULT 0,
        quota_limit INT DEFAULT 50,
        quota_sold INT DEFAULT 0,
        max_per_user INT DEFAULT 1,
        start_time TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        end_time TIMESTAMP WITH TIME ZONE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        button_text VARCHAR(100) DEFAULT 'Beli Promo Flash Sale',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ftth_nodes (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(32) NOT NULL DEFAULT 'ODP',
        lat NUMERIC(10, 8) NOT NULL,
        lng NUMERIC(11, 8) NOT NULL,
        splitter_capacity INT DEFAULT 8,
        splitter_ratio VARCHAR(32) DEFAULT '1:8',
        output_power NUMERIC(6, 2) DEFAULT 9.00,
        sfp_powers JSONB DEFAULT '[]'::jsonb,
        attenuation_db NUMERIC(6, 2) DEFAULT 0.00,
        calculated_rx_power NUMERIC(6, 2),
        calculated_tx_power NUMERIC(6, 2),
        total_loss_db NUMERIC(6, 2),
        customer_id VARCHAR(64),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ftth_cables (
        id VARCHAR(64) PRIMARY KEY,
        from_id VARCHAR(64) NOT NULL,
        from_port INT DEFAULT 1,
        to_id VARCHAR(64) NOT NULL,
        to_port INT DEFAULT 1,
        waypoints JSONB DEFAULT '[]'::jsonb,
        cable_length_m NUMERIC(10, 2) DEFAULT 0,
        attenuation_db NUMERIC(6, 2) DEFAULT 0,
        cable_color VARCHAR(32),
        core_number VARCHAR(64),
        cable_type VARCHAR(64),
        total_cores INT DEFAULT 4,
        core_splicing_map JSONB DEFAULT '{}'::jsonb,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ftth_splitter_types (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        category VARCHAR(32) NOT NULL DEFAULT 'symmetric',
        ratio_code VARCHAR(50) NOT NULL,
        capacity INT NOT NULL DEFAULT 2,
        pass_loss_db NUMERIC(6, 2) NOT NULL DEFAULT 3.5,
        drop_loss_db NUMERIC(6, 2) NOT NULL DEFAULT 3.5,
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS ppp_connection_logs (
        id VARCHAR(64) PRIMARY KEY,
        customer_id VARCHAR(64) REFERENCES customers(id) ON DELETE SET NULL,
        username VARCHAR(255) NOT NULL,
        action VARCHAR(32) NOT NULL,
        ip_address VARCHAR(64),
        mac_address VARCHAR(64),
        session_id VARCHAR(64),
        bytes_in BIGINT DEFAULT 0,
        bytes_out BIGINT DEFAULT 0,
        uptime VARCHAR(64),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `).catch((err) => console.warn('Base table init notice:', err.message));

    // 1. Alter & Patch router_profiles table columns (CRITICAL FIX)
    await pool.query(`
      ALTER TABLE router_profiles
      ADD COLUMN IF NOT EXISTS local_address_mode VARCHAR(32) DEFAULT 'manual',
      ADD COLUMN IF NOT EXISTS local_address VARCHAR(64),
      ADD COLUMN IF NOT EXISTS remote_address VARCHAR(64),
      ADD COLUMN IF NOT EXISTS parent_queue VARCHAR(255),
      ADD COLUMN IF NOT EXISTS dns_server VARCHAR(255),
      ADD COLUMN IF NOT EXISTS is_synced BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS on_router BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE;

      ALTER TABLE packages
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS lock_server BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS expired_mode VARCHAR(32) DEFAULT 'rem',
      ADD COLUMN IF NOT EXISTS validity_iso VARCHAR(64) DEFAULT 'P1M',
      ADD COLUMN IF NOT EXISTS grace_period_iso VARCHAR(64) DEFAULT 'P5D',
      DROP COLUMN IF EXISTS validity_days,
      DROP COLUMN IF EXISTS validity_unit,
      DROP COLUMN IF EXISTS validity_value,
      DROP COLUMN IF EXISTS grace_period_days;

      ALTER TABLE routers
      ADD COLUMN IF NOT EXISTS dns_name VARCHAR(255) DEFAULT 'arab.net',
      ADD COLUMN IF NOT EXISTS hotspot_ip VARCHAR(64) DEFAULT '10.0.0.1';

      -- Pastikan default validity_iso dan grace_period_iso terisi jika masih NULL
      UPDATE packages SET validity_iso = 'P1M' WHERE validity_iso IS NULL;
      UPDATE packages SET grace_period_iso = 'P5D' WHERE grace_period_iso IS NULL;

      -- Normalisasi nilai legacy uptime_limit ke format standar ISO-8601 Duration
      UPDATE packages SET uptime_limit = 'PT3H' WHERE uptime_limit = '3h';
      UPDATE packages SET uptime_limit = 'P1D' WHERE uptime_limit = '1d';
      UPDATE packages SET uptime_limit = 'PT30M' WHERE uptime_limit = '30m';
      UPDATE packages SET uptime_limit = 'PT1H' WHERE uptime_limit = '1h';
      -- Alter & Patch hotspot_vouchers table for first login webhook & invoice relation
      ALTER TABLE hotspot_vouchers
      ADD COLUMN IF NOT EXISTS first_login_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS mac_address VARCHAR(64),
      ADD COLUMN IF NOT EXISTS ip_address VARCHAR(64),
      ADD COLUMN IF NOT EXISTS invoice_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(64),
      ADD COLUMN IF NOT EXISTS expired_at TIMESTAMP WITH TIME ZONE;

      -- Alter & Patch invoices table for voucher relation
      ALTER TABLE invoices
      ADD COLUMN IF NOT EXISTS voucher_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(64),
      ADD COLUMN IF NOT EXISTS flash_sale_id VARCHAR(64);
    `).catch((err) => console.warn('Patch router_profiles & packages notice:', err.message));
    console.log('✅ routers, router_profiles, packages, hotspot_vouchers & invoices schema patched successfully!');

    // 2. Alter & Patch ip_pools table columns
    await pool.query(`
      ALTER TABLE ip_pools
      ADD COLUMN IF NOT EXISTS gateway VARCHAR(64),
      ADD COLUMN IF NOT EXISTS ranges VARCHAR(255),
      ADD COLUMN IF NOT EXISTS total_ip INT DEFAULT 253,
      ADD COLUMN IF NOT EXISTS subnet VARCHAR(32) DEFAULT '/24',
      ADD COLUMN IF NOT EXISTS is_synced BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS on_router BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS synced_at TIMESTAMP WITH TIME ZONE;
    `).catch((err) => console.warn('Patch ip_pools notice:', err.message));
    console.log('✅ ip_pools schema (gateway, ranges, is_synced, etc.) verified & patched successfully!');

    // 3. Alter & Patch users table columns
    await pool.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255),
      ADD COLUMN IF NOT EXISTS arabpay_user_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS arabpay_token TEXT,
      ADD COLUMN IF NOT EXISTS role VARCHAR(32) DEFAULT 'teknisi',
      ADD COLUMN IF NOT EXISTS phone_number VARCHAR(64);
    `).catch((err) => console.warn('Patch users notice:', err.message));
    console.log('✅ users schema (password_hash, arabpay_user_id, arabpay_token, role) patched successfully!');

    // 4. Alter & Patch customers table columns
    await pool.query(`
      ALTER TABLE customers ALTER COLUMN phone_number DROP NOT NULL;
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS mikrotik_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS is_synced BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS custom_price NUMERIC(12, 2),
      ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 8),
      ADD COLUMN IF NOT EXISTS longitude NUMERIC(11, 8),
      ADD COLUMN IF NOT EXISTS maps_url TEXT,
      ADD COLUMN IF NOT EXISTS dusun VARCHAR(255),
      ADD COLUMN IF NOT EXISTS desa VARCHAR(255),
      ADD COLUMN IF NOT EXISTS kecamatan VARCHAR(255),
      ADD COLUMN IF NOT EXISTS kabupaten VARCHAR(255),
      ADD COLUMN IF NOT EXISTS provinsi VARCHAR(255),
      ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS last_connected_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS last_disconnected_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS current_ip VARCHAR(64);
    `).catch((err) => console.warn('Patch customers notice:', err.message));
    console.log('✅ customers schema (mikrotik_id, is_synced, online tracking, address fields) patched successfully!');

    // 5. Alter & Patch invoices table columns
    await pool.query(`
      ALTER TABLE invoices 
      ADD COLUMN IF NOT EXISTS customer_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS user_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS voucher_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS voucher_code VARCHAR(64),
      ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(64),
      ADD COLUMN IF NOT EXISTS connection_type VARCHAR(32) DEFAULT 'pppoe',
      ADD COLUMN IF NOT EXISTS package_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS total NUMERIC(12, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS status VARCHAR(32) DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS issue_date DATE DEFAULT CURRENT_DATE,
      ADD COLUMN IF NOT EXISTS due_date DATE,
      ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(64),
      ADD COLUMN IF NOT EXISTS notes TEXT;

      ALTER TABLE invoices DROP COLUMN IF EXISTS client_name;
      ALTER TABLE invoices DROP COLUMN IF EXISTS client_phone;

      ALTER TABLE invoices ALTER COLUMN issue_date DROP NOT NULL;
      ALTER TABLE invoices ALTER COLUMN issue_date SET DEFAULT CURRENT_DATE;
    `).catch((err) => console.warn('Patch invoices notice:', err.message));
    console.log('✅ invoices schema patched successfully!');

    // 6. Alter & Patch hotspot_vouchers table columns
    await pool.query(`
      ALTER TABLE hotspot_vouchers
      ADD COLUMN IF NOT EXISTS batch_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS router_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS router_profile_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS invoice_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(64),
      ADD COLUMN IF NOT EXISTS is_synced BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP WITH TIME ZONE,
      ADD COLUMN IF NOT EXISTS sync_error TEXT,
      ADD COLUMN IF NOT EXISTS sold_to VARCHAR(255),
      ADD COLUMN IF NOT EXISTS sold_at TIMESTAMP WITH TIME ZONE;
    `).catch((err) => console.warn('Patch hotspot_vouchers notice:', err.message));
    console.log('✅ hotspot_vouchers schema patched successfully!');

    // 7. Alter & Patch FTTH Topology tables
    await pool.query(`
      ALTER TABLE ftth_nodes
      ADD COLUMN IF NOT EXISTS splitter_ratio VARCHAR(32) DEFAULT '1:8',
      ADD COLUMN IF NOT EXISTS output_power NUMERIC(6, 2) DEFAULT 9.00,
      ADD COLUMN IF NOT EXISTS sfp_powers JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS attenuation_db NUMERIC(6, 2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS calculated_rx_power NUMERIC(6, 2),
      ADD COLUMN IF NOT EXISTS calculated_tx_power NUMERIC(6, 2),
      ADD COLUMN IF NOT EXISTS total_loss_db NUMERIC(6, 2);

      ALTER TABLE ftth_cables
      ADD COLUMN IF NOT EXISTS cable_length_m NUMERIC(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS attenuation_db NUMERIC(6, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cable_color VARCHAR(32),
      ADD COLUMN IF NOT EXISTS core_number VARCHAR(64),
      ADD COLUMN IF NOT EXISTS cable_type VARCHAR(64),
      ADD COLUMN IF NOT EXISTS total_cores INT DEFAULT 4,
      ADD COLUMN IF NOT EXISTS core_splicing_map JSONB DEFAULT '{}'::jsonb;
    `).catch((err) => console.warn('Patch FTTH notice:', err.message));
    console.log('✅ FTTH nodes & cables schema patched successfully!');

    // 8. HIGH PERFORMANCE INDEXES (TANGGUH & CEPAT)
    await pool.query(`
      -- Customers Indexing
      CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone_number);
      CREATE INDEX IF NOT EXISTS idx_customers_code ON customers(customer_code);
      CREATE INDEX IF NOT EXISTS idx_customers_pppoe ON customers(pppoe_username);
      CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
      CREATE INDEX IF NOT EXISTS idx_customers_user_id ON customers(user_id);
      CREATE INDEX IF NOT EXISTS idx_customers_router_id ON customers(router_id);
      CREATE INDEX IF NOT EXISTS idx_customers_package_id ON customers(package_id);
      CREATE INDEX IF NOT EXISTS idx_customers_profile_id ON customers(router_profile_id);
      CREATE INDEX IF NOT EXISTS idx_customers_expired_at ON customers(expired_at);

      -- Router Profiles & IP Pools Indexing
      CREATE INDEX IF NOT EXISTS idx_router_profiles_router_id ON router_profiles(router_id);
      CREATE INDEX IF NOT EXISTS idx_router_profiles_name ON router_profiles(router_id, name);
      CREATE INDEX IF NOT EXISTS idx_ip_pools_router_id ON ip_pools(router_id);

      -- Invoices Indexing
      CREATE INDEX IF NOT EXISTS idx_invoices_customer_id ON invoices(customer_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
      CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
      CREATE INDEX IF NOT EXISTS idx_invoices_number ON invoices(invoice_number);
      CREATE INDEX IF NOT EXISTS idx_invoices_voucher_id ON invoices(voucher_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_customer_phone ON invoices(customer_phone);

      -- Hotspot Vouchers Indexing
      CREATE INDEX IF NOT EXISTS idx_vouchers_code ON hotspot_vouchers(code);
      CREATE INDEX IF NOT EXISTS idx_vouchers_status ON hotspot_vouchers(status);
      CREATE INDEX IF NOT EXISTS idx_vouchers_is_synced ON hotspot_vouchers(is_synced);
      CREATE INDEX IF NOT EXISTS idx_vouchers_batch ON hotspot_vouchers(batch_id);
      CREATE INDEX IF NOT EXISTS idx_vouchers_router ON hotspot_vouchers(router_id);
      CREATE INDEX IF NOT EXISTS idx_vouchers_profile ON hotspot_vouchers(router_profile_id);
      CREATE INDEX IF NOT EXISTS idx_vouchers_invoice_id ON hotspot_vouchers(invoice_id);
      CREATE INDEX IF NOT EXISTS idx_vouchers_sold_to ON hotspot_vouchers(sold_to);

      -- Users Indexing
      CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
      CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
      CREATE INDEX IF NOT EXISTS idx_users_arabpay ON users(arabpay_user_id);

      -- FTTH Indexing
      CREATE INDEX IF NOT EXISTS idx_ftth_nodes_customer ON ftth_nodes(customer_id);
      CREATE INDEX IF NOT EXISTS idx_ftth_cables_from ON ftth_cables(from_id);
      CREATE INDEX IF NOT EXISTS idx_ftth_cables_to ON ftth_cables(to_id);
    `).catch((err) => console.warn('Indexes creation notice:', err.message));
    console.log('⚡ PostgreSQL Performance Indexes (Customers, Profiles, Invoices, Vouchers, FTTH) created successfully!');

    // 9. Smart Seeder: Splitter Types
    await pool.query(`
      INSERT INTO ftth_splitter_types (id, name, category, ratio_code, capacity, pass_loss_db, drop_loss_db, description) VALUES
      ('sp_1_2', 'Splitter 1:2', 'symmetric', '1:2', 2, 3.5, 3.5, 'PLC Splitter Simetris 2 Port Output'),
      ('sp_1_4', 'Splitter 1:4', 'symmetric', '1:4', 4, 7.2, 7.2, 'PLC Splitter Simetris 4 Port Output'),
      ('sp_1_8', 'Splitter 1:8', 'symmetric', '1:8', 8, 10.5, 10.5, 'PLC Splitter Simetris 8 Port Output'),
      ('sp_1_16', 'Splitter 1:16', 'symmetric', '1:16', 16, 13.8, 13.8, 'PLC Splitter Simetris 16 Port Output'),
      ('sp_1_32', 'Splitter 1:32', 'symmetric', '1:32', 32, 17.0, 17.0, 'PLC Splitter Simetris 32 Port Output'),
      ('sp_95_5', 'Rasio 95:5', 'asymmetric', '95:5', 2, 0.4, 13.5, 'Splitter Asimetris Ratio 95% Pass / 5% Drop'),
      ('sp_90_10', 'Rasio 90:10', 'asymmetric', '90:10', 2, 0.8, 10.8, 'Splitter Asimetris Ratio 90% Pass / 10% Drop'),
      ('sp_85_15', 'Rasio 85:15', 'asymmetric', '85:15', 2, 1.1, 9.0, 'Splitter Asimetris Ratio 85% Pass / 15% Drop'),
      ('sp_80_20', 'Rasio 80:20', 'asymmetric', '80:20', 2, 1.4, 7.6, 'Splitter Asimetris Ratio 80% Pass / 20% Drop'),
      ('sp_75_25', 'Rasio 75:25', 'asymmetric', '75:25', 2, 1.7, 6.6, 'Splitter Asimetris Ratio 75% Pass / 25% Drop'),
      ('sp_70_30', 'Rasio 70:30', 'asymmetric', '70:30', 2, 2.0, 5.8, 'Splitter Asimetris Ratio 70% Pass / 30% Drop'),
      ('sp_65_35', 'Rasio 65:35', 'asymmetric', '65:35', 2, 2.4, 5.1, 'Splitter Asimetris Ratio 65% Pass / 35% Drop'),
      ('sp_60_40', 'Rasio 60:40', 'asymmetric', '60:40', 2, 2.8, 4.5, 'Splitter Asimetris Ratio 60% Pass / 40% Drop'),
      ('sp_55_45', 'Rasio 55:45', 'asymmetric', '55:45', 2, 3.2, 4.0, 'Splitter Asimetris Ratio 55% Pass / 45% Drop'),
      ('sp_50_50', 'Rasio 50:50', 'asymmetric', '50:50', 2, 3.5, 3.5, 'Splitter Asimetris Ratio 50% Pass / 50% Drop'),
      ('sp_hy_9010_14', 'Hybrid 90:10 + 1:4', 'hybrid', '90:10 + 1:4', 5, 0.8, 18.0, 'Hybrid Tembak Tengah (Pass 90% Feeder / Drop 10% + 1:4 Lokal)'),
      ('sp_hy_9010_18', 'Hybrid 90:10 + 1:8', 'hybrid', '90:10 + 1:8', 9, 0.8, 21.3, 'Hybrid Tembak Tengah (Pass 90% Feeder / Drop 10% + 1:8 Lokal)'),
      ('sp_hy_8020_14', 'Hybrid 80:20 + 1:4', 'hybrid', '80:20 + 1:4', 5, 1.4, 14.8, 'Hybrid Tembak Tengah (Pass 80% Feeder / Drop 20% + 1:4 Lokal)'),
      ('sp_hy_8020_18', 'Hybrid 80:20 + 1:8', 'hybrid', '80:20 + 1:8', 9, 1.4, 18.1, 'Hybrid Tembak Tengah (Pass 80% Feeder / Drop 20% + 1:8 Lokal)'),
      ('sp_hy_7030_14', 'Hybrid 70:30 + 1:4', 'hybrid', '70:30 + 1:4', 5, 2.0, 13.0, 'Hybrid Tembak Tengah (Pass 70% Feeder / Drop 30% + 1:4 Lokal)'),
      ('sp_hy_7030_18', 'Hybrid 70:30 + 1:8', 'hybrid', '70:30 + 1:8', 9, 2.0, 16.3, 'Hybrid Tembak Tengah (Pass 70% Feeder / Drop 30% + 1:8 Lokal)')
      ON CONFLICT (id) DO NOTHING;
    `).catch(() => {});

    // 10. Smart Seeder: Seed default packages if empty in PostgreSQL
    try {
      const pkgCheck = await pool.query('SELECT COUNT(*)::int as total FROM packages');
      if (pkgCheck.rows[0]?.total === 0) {
        await pool.query(`
          INSERT INTO packages (id, name, type, price, speed_limit, validity_iso, grace_period_iso, only_one_user, uptime_limit, quota_mb, mikrotik_profile, shared_users) VALUES
          ('pkg-hotspot-m', 'Hotspot Unlimited Bulanan', 'hotspot_monthly', 50000, '5M/5M', 'P1M', 'P5D', false, NULL, NULL, 'default', 1),
          ('pkg-v-3h', 'Voucher Hotspot 3 Jam', 'hotspot_voucher', 5000, '3M/3M', 'PT3H', 'P1D', false, 'PT3H', NULL, 'default', 1),
          ('pkg-pppoe-10m', 'Home BroadBand 10 Mbps', 'pppoe', 100000, '10M/10M', 'P1M', 'P5D', false, NULL, NULL, 'default', 1),
          ('pkg-pppoe-20m', 'Home BroadBand 20 Mbps', 'pppoe', 150000, '20M/20M', 'P1M', 'P5D', false, NULL, NULL, 'default', 1)
          ON CONFLICT (id) DO NOTHING;
        `);
        console.log('✅ Smart package seeder: Internet packages seeded into PostgreSQL successfully!');
      }
    } catch (err: any) {
      console.warn('Package smart seeder notice:', err.message);
    }

    // 11. Smart Migration for Flash Sales
    try {
      const fsCheck = await pool.query('SELECT COUNT(*)::int as total FROM flash_sales');
      if (fsCheck.rows[0]?.total === 0) {
        const portalRow = await pool.query("SELECT value FROM system_settings WHERE key = 'customer_portal_config' LIMIT 1");
        if (portalRow.rows.length > 0 && portalRow.rows[0].value) {
          try {
            const parsed = JSON.parse(portalRow.rows[0].value);
            if (parsed.flash_sale && parsed.flash_sale.title) {
              const oldFs = parsed.flash_sale;
              await pool.query(`
                INSERT INTO flash_sales (
                  id, title, subtitle, badge_label, discount_text,
                  target_package_id, target_package_name,
                  original_price, promo_price, quota_limit, quota_sold, max_per_user,
                  end_time, is_active, button_text
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                ON CONFLICT (id) DO NOTHING
              `, [
                'fs_default_initial',
                oldFs.title || '⚡ Promo Hotspot Spesial Akhir Pekan',
                oldFs.subtitle || 'Dapatkan voucher hotspot dengan harga spesial sebelum kuota berakhir!',
                oldFs.badge_label || 'FLASH SALE',
                oldFs.discount_text || 'Diskon Terbatas 50%',
                oldFs.target_package_id || '',
                oldFs.target_package_name || '',
                Number(oldFs.original_price) || 5000,
                Number(oldFs.promo_price) || 2500,
                Number(oldFs.quota_limit) || 50,
                Number(oldFs.quota_sold) || 0,
                Number(oldFs.max_per_user) || 1,
                oldFs.end_time || new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
                oldFs.enabled !== false,
                oldFs.button_text || 'Beli Promo Flash Sale'
              ]);
              console.log('✅ Migrated initial Flash Sale config into dedicated flash_sales table!');
            }
          } catch (_) {}
        }
      }
    } catch (fsErr: any) {
      console.warn('Flash sales migration notice:', fsErr.message);
    }

    console.log('🚀 PostgreSQL schema initialization & high-speed indexes completed successfully!');
  } catch (err: any) {
    console.error('Schema initialization error:', err.message);
  }
}
