-- Pro-Fab 3D — MySQL schema
-- Run once against the database:
--   mysql -u root pro-fab-3d < db/schema.sql
-- To update an existing DB run:
--   node db/update-schema.js

-- ── Listings (products for sale) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS listings (
  id          VARCHAR(64)                                           NOT NULL PRIMARY KEY,
  name        VARCHAR(255)                                          NOT NULL,
  category    VARCHAR(128)                                          NOT NULL DEFAULT '',
  description TEXT                                                      NULL,
  price       DECIMAL(10,2)                                         NOT NULL DEFAULT 0.00,
  sale_price  DECIMAL(10,2)                                             NULL DEFAULT NULL,
  material    VARCHAR(128)                                          NOT NULL DEFAULT '',
  print_time  VARCHAR(64)                                           NOT NULL DEFAULT '',
  dimensions  VARCHAR(128)                                          NOT NULL DEFAULT '',
  image       LONGTEXT                                                  NULL,
  emoji       VARCHAR(64) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '📦',
  in_stock    TINYINT(1)                                            NOT NULL DEFAULT 1,
  created_at  TIMESTAMP                                             NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Customer accounts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS accounts (
  id              VARCHAR(64)   NOT NULL PRIMARY KEY,
  name            VARCHAR(255)  NOT NULL DEFAULT '',
  email           VARCHAR(255)  NOT NULL UNIQUE,
  pw_hash         VARCHAR(255)  NOT NULL DEFAULT '',
  profile         JSON              NULL,   -- { firstName, lastName, email, phone }
  merits_balance  INT           NOT NULL DEFAULT 0,
  registered_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Orders (standard + custom requests) ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id             VARCHAR(64)   NOT NULL PRIMARY KEY,
  date           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status         VARCHAR(64)   NOT NULL DEFAULT 'New',
  type           VARCHAR(32)   NOT NULL DEFAULT 'order',   -- 'order' | 'custom'
  user_id        VARCHAR(64)       NULL,
  customer       JSON              NULL,   -- { name, email, phone }
  notes          TEXT              NULL,
  payment_method VARCHAR(32)   NOT NULL DEFAULT 'cash',
  items          JSON              NULL,   -- [{ name, qty, price, origPrice }]
  total          DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  merits_total   INT           NOT NULL DEFAULT 0,
  stripe_id      VARCHAR(128)      NULL,
  description    TEXT              NULL,   -- custom order description
  photo          LONGTEXT          NULL,   -- custom order photo (base64)
  created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Notifications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id         VARCHAR(64)   NOT NULL PRIMARY KEY,
  user_id    VARCHAR(64)   NOT NULL,
  type       VARCHAR(64)   NOT NULL DEFAULT '',
  order_id   VARCHAR(64)       NULL,
  message    TEXT              NULL,
  date       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  is_read    TINYINT(1)    NOT NULL DEFAULT 0
);

-- ── Admin accounts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_accounts (
  id          VARCHAR(64)   NOT NULL PRIMARY KEY,
  username    VARCHAR(128)  NOT NULL UNIQUE,
  salt        VARCHAR(128)  NOT NULL DEFAULT '',
  hash        VARCHAR(255)  NOT NULL DEFAULT '',
  role        VARCHAR(32)   NOT NULL DEFAULT 'staff',
  permissions JSON              NULL,   -- ['orders','products',...]
  created_at  TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Clock-in sessions (completed shifts) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS clock_sessions (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  account_id  VARCHAR(64)   NOT NULL,
  username    VARCHAR(128)  NOT NULL DEFAULT '',
  start_time  DATETIME      NOT NULL,
  end_time    DATETIME      NOT NULL,
  duration_ms BIGINT        NOT NULL DEFAULT 0
);

-- ── Clock-in active (one row per currently-clocked-in admin) ──────────────────
CREATE TABLE IF NOT EXISTS clock_active (
  account_id  VARCHAR(64)   NOT NULL PRIMARY KEY,
  username    VARCHAR(128)  NOT NULL DEFAULT '',
  start_time  DATETIME      NOT NULL
);

-- ── Support tickets (chat-based problem reports) ──────────────────────────────
CREATE TABLE IF NOT EXISTS support_tickets (
  id            VARCHAR(64)   NOT NULL PRIMARY KEY,
  session_id    VARCHAR(64)   NOT NULL,              -- groups messages in one chat
  sender        ENUM('user','bot') NOT NULL DEFAULT 'user',
  name          VARCHAR(255)  NOT NULL DEFAULT 'Anonymous',
  email         VARCHAR(255)  NOT NULL DEFAULT '',
  message       TEXT          NOT NULL,
  status        VARCHAR(32)   NOT NULL DEFAULT 'open', -- 'open' | 'resolved'
  created_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
