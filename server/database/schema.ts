import { pool } from '../config/db.js';

export async function initDatabaseSchema() {
  try {
    // 1. Ensure phone_number in customers is NULLABLE
    await pool.query('ALTER TABLE customers ALTER COLUMN phone_number DROP NOT NULL').catch(() => {});

    // 2. Create invoices table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id VARCHAR(64) PRIMARY KEY,
        invoice_number VARCHAR(64) UNIQUE NOT NULL,
        customer_id VARCHAR(64) REFERENCES customers(id) ON DELETE SET NULL,
        customer_name VARCHAR(255),
        customer_phone VARCHAR(64),
        connection_type VARCHAR(32) NOT NULL DEFAULT 'pppoe',
        package_name VARCHAR(255),
        amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
        status VARCHAR(32) NOT NULL DEFAULT 'pending',
        issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
        due_date DATE,
        paid_at TIMESTAMP WITH TIME ZONE,
        payment_method VARCHAR(64),
        notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    // 3. Patch invoices table columns
    await pool.query(`
      ALTER TABLE invoices 
      ADD COLUMN IF NOT EXISTS customer_id VARCHAR(64),
      ADD COLUMN IF NOT EXISTS customer_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS client_name VARCHAR(255),
      ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(64),
      ADD COLUMN IF NOT EXISTS client_phone VARCHAR(64),
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

      ALTER TABLE invoices ALTER COLUMN issue_date DROP NOT NULL;
      ALTER TABLE invoices ALTER COLUMN issue_date SET DEFAULT CURRENT_DATE;
    `).catch(() => {});
    console.log('✅ Invoices table schema patched successfully!');

    // 4. Patch customers table columns (latitude, longitude, maps_url, structured address)
    await pool.query(`
      ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS latitude NUMERIC(10, 8),
      ADD COLUMN IF NOT EXISTS longitude NUMERIC(11, 8),
      ADD COLUMN IF NOT EXISTS maps_url TEXT,
      ADD COLUMN IF NOT EXISTS dusun VARCHAR(255),
      ADD COLUMN IF NOT EXISTS desa VARCHAR(255),
      ADD COLUMN IF NOT EXISTS kecamatan VARCHAR(255),
      ADD COLUMN IF NOT EXISTS kabupaten VARCHAR(255),
      ADD COLUMN IF NOT EXISTS provinsi VARCHAR(255)
    `);
    console.log('✅ Customers table schema (latitude, longitude, maps_url, dusun, desa, kecamatan, kabupaten, provinsi) patched successfully!');

    // 5. Create & Patch ftth_nodes table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ftth_nodes (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(32) NOT NULL DEFAULT 'ODP',
        lat NUMERIC(10, 8) NOT NULL,
        lng NUMERIC(11, 8) NOT NULL,
        splitter_capacity INT DEFAULT 8,
        splitter_ratio VARCHAR(32) DEFAULT '1:8',
        output_power NUMERIC(6, 2) DEFAULT 9.00,
        attenuation_db NUMERIC(6, 2) DEFAULT 0.00,
        customer_id VARCHAR(64),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      ALTER TABLE ftth_nodes
      ADD COLUMN IF NOT EXISTS splitter_ratio VARCHAR(32) DEFAULT '1:8',
      ADD COLUMN IF NOT EXISTS output_power NUMERIC(6, 2) DEFAULT 9.00,
      ADD COLUMN IF NOT EXISTS sfp_powers JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS attenuation_db NUMERIC(6, 2) DEFAULT 0.00,
      ADD COLUMN IF NOT EXISTS calculated_rx_power NUMERIC(6, 2),
      ADD COLUMN IF NOT EXISTS calculated_tx_power NUMERIC(6, 2),
      ADD COLUMN IF NOT EXISTS total_loss_db NUMERIC(6, 2);
    `).catch(() => {});

    // 6. Create & Patch ftth_cables table if not exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ftth_cables (
        id VARCHAR(64) PRIMARY KEY,
        from_id VARCHAR(64) NOT NULL,
        from_port INT DEFAULT 1,
        to_id VARCHAR(64) NOT NULL,
        to_port INT DEFAULT 1,
        waypoints JSONB DEFAULT '[]'::jsonb,
        cable_length_m NUMERIC(10, 2) DEFAULT 0,
        attenuation_db NUMERIC(6, 2) DEFAULT 0,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `).catch(() => {});

    await pool.query(`
      ALTER TABLE ftth_cables
      ADD COLUMN IF NOT EXISTS cable_length_m NUMERIC(10, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS attenuation_db NUMERIC(6, 2) DEFAULT 0,
      ADD COLUMN IF NOT EXISTS cable_color VARCHAR(32),
      ADD COLUMN IF NOT EXISTS core_number VARCHAR(64),
      ADD COLUMN IF NOT EXISTS cable_type VARCHAR(64),
      ADD COLUMN IF NOT EXISTS total_cores INT DEFAULT 4,
      ADD COLUMN IF NOT EXISTS core_splicing_map JSONB DEFAULT '{}'::jsonb;
    `).catch(() => {});
    console.log('✅ FTTH Map topology tables (ftth_nodes, ftth_cables) patched with cable_color, core_number, total_cores, core_splicing_map successfully!');

    // 7. Patch hotspot_vouchers table with sold_to & sold_at columns
    await pool.query(`
      ALTER TABLE hotspot_vouchers
      ADD COLUMN IF NOT EXISTS sold_to VARCHAR(255),
      ADD COLUMN IF NOT EXISTS sold_at TIMESTAMP WITH TIME ZONE
    `).catch(() => {});
    console.log('✅ hotspot_vouchers table patched with sold_to, sold_at columns!');

    // 8. Create & Smart-Seed ftth_splitter_types table if missing data
    await pool.query(`
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
      )
    `).catch(() => {});

    // Smart Seeder: ON CONFLICT (id) DO NOTHING (Inserts missing defaults without overwriting user updates)
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
    console.log('✅ ftth_splitter_types master table & smart seeder executed successfully!');

  } catch (err: any) {
    console.error('Schema initialization error:', err.message);
  }
}
