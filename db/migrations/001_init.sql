
-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Table for storing jobs
CREATE TABLE jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    type TEXT NOT NULL,

    payload JSONB NOT NULL,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN (
            'pending',
            'processing',
            'completed',
            'failed'
        )),

    result JSONB,

    error TEXT,

    attempts INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    started_at TIMESTAMPTZ,

    finished_at TIMESTAMPTZ
);

-- Indexes to optimize queries
CREATE INDEX jobs_status_idx ON jobs (status);

CREATE INDEX jobs_created_at_idx ON jobs (created_at DESC);
