-- Apply only after explicit D1 resource approval and migration review.
CREATE TABLE IF NOT EXISTS paper_portfolios (
  owner_sub TEXT PRIMARY KEY NOT NULL,
  version INTEGER NOT NULL CHECK(version >= 1),
  snapshot_json TEXT NOT NULL
);
