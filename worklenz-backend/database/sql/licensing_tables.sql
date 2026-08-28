-- The open-core schema removed billing administration tables, but the shared
-- application functions still require these core licensing records.

CREATE TABLE IF NOT EXISTS sys_license_types (
    id          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name        TEXT NOT NULL,
    key         TEXT NOT NULL UNIQUE,
    description TEXT
);

CREATE TABLE IF NOT EXISTS licensing_pricing_plans (
    id               UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name             TEXT DEFAULT '' NOT NULL,
    billing_type     TEXT DEFAULT 'month' NOT NULL CHECK (billing_type IN ('month', 'year')),
    billing_period   INTEGER DEFAULT 1 NOT NULL,
    default_currency TEXT DEFAULT 'USD' NOT NULL,
    initial_price    TEXT DEFAULT '0' NOT NULL,
    recurring_price  TEXT DEFAULT '0' NOT NULL,
    trial_days       INTEGER DEFAULT 0 NOT NULL,
    paddle_id        INTEGER UNIQUE,
    active           BOOLEAN DEFAULT FALSE NOT NULL,
    is_startup_plan  BOOLEAN DEFAULT FALSE NOT NULL
);

CREATE TABLE IF NOT EXISTS licensing_settings (
    default_trial_storage NUMERIC DEFAULT 1 NOT NULL,
    default_storage       NUMERIC DEFAULT 25 NOT NULL,
    storage_addon_price   NUMERIC DEFAULT 0 NOT NULL,
    storage_addon_size    NUMERIC DEFAULT 0,
    default_monthly_plan  UUID REFERENCES licensing_pricing_plans(id),
    default_annual_plan   UUID REFERENCES licensing_pricing_plans(id),
    default_startup_plan  UUID REFERENCES licensing_pricing_plans(id),
    projects_limit        INTEGER DEFAULT 5 NOT NULL,
    team_member_limit     INTEGER DEFAULT 0 NOT NULL,
    free_tier_storage     INTEGER DEFAULT 5 NOT NULL,
    trial_duration        INTEGER DEFAULT 14 NOT NULL
);

INSERT INTO licensing_settings DEFAULT VALUES;

CREATE TABLE IF NOT EXISTS licensing_coupon_codes (
    id                 UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    coupon_code        TEXT NOT NULL UNIQUE,
    is_redeemed        BOOLEAN DEFAULT FALSE,
    is_app_sumo        BOOLEAN DEFAULT FALSE,
    projects_limit     INTEGER,
    team_members_limit INTEGER DEFAULT 3,
    storage_limit      INTEGER DEFAULT 5,
    redeemed_by        UUID REFERENCES users(id),
    batch_id           UUID,
    created_by         UUID,
    created_at         TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    redeemed_at        TIMESTAMP WITH TIME ZONE,
    is_refunded        BOOLEAN DEFAULT FALSE,
    reason             TEXT,
    feedback           TEXT,
    refunded_at        TIMESTAMP WITH TIME ZONE
);

CREATE TABLE IF NOT EXISTS licensing_custom_subs (
    id           UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id      UUID NOT NULL REFERENCES users(id),
    billing_type TEXT DEFAULT 'year' NOT NULL,
    currency     TEXT DEFAULT 'LKR' NOT NULL,
    rate         NUMERIC DEFAULT 0 NOT NULL,
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    end_date     DATE NOT NULL,
    user_limit   INTEGER
);

CREATE TABLE IF NOT EXISTS licensing_user_subscriptions (
    id                          UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id                     UUID NOT NULL REFERENCES users(id),
    paddle_user_id              INTEGER,
    cancel_url                  TEXT,
    update_url                  TEXT,
    checkout_id                 TEXT,
    next_bill_date              TEXT,
    quantity                    INTEGER DEFAULT 1 NOT NULL,
    subscription_id             INTEGER UNIQUE,
    subscription_plan_id        INTEGER,
    unit_price                  NUMERIC,
    plan_id                     UUID NOT NULL REFERENCES licensing_pricing_plans(id),
    status                      TEXT CHECK (status IN ('active', 'past_due', 'trialing', 'paused', 'deleted')),
    custom_value_month          NUMERIC DEFAULT 0 NOT NULL,
    custom_value_year           NUMERIC DEFAULT 0 NOT NULL,
    custom_storage_amount       NUMERIC DEFAULT 0 NOT NULL,
    custom_storage_unit         TEXT DEFAULT 'MB' NOT NULL,
    cancellation_effective_date DATE,
    currency                    TEXT DEFAULT 'USD' NOT NULL,
    event_time                  TEXT,
    paused_at                   TEXT,
    paused_from                 TEXT,
    paused_reason               TEXT,
    active                      BOOLEAN DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS licensing_coupon_codes_redeemed_by_index
    ON licensing_coupon_codes(redeemed_by);
CREATE INDEX IF NOT EXISTS licensing_custom_subs_user_id_index
    ON licensing_custom_subs(user_id);
CREATE INDEX IF NOT EXISTS licensing_user_subscriptions_user_id_index
    ON licensing_user_subscriptions(user_id);
