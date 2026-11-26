# Intelligent Processing Desk

The owner supplied sections 1–20 after the initial checkpoint. This branch combines them with sections 21–30 and starts from main, including the released rep dashboard.

| Milestone | Acceptance criteria | Status |
| --- | --- | --- |
| A. Funder master and routing | Reconcile inventory, preserve source evidence, evaluate active funders with review for incomplete data, surface results automatically in the admin processing queue. | Checkpoint pushed after routing tests, lint, and type checking |
| B. Submission workspace | Select individually approved recipients, render independent packages, verify identity and retry behavior, record confirmed email and assisted portal submissions in the existing tracker. | Pending |
| C. Document analysis | Disabled external integrations, mock processing, deterministic calculations with evidence, reviewed inputs feeding routing. | Pending |
| D. Incoming responses | Mock ingestion, verified thread matching or review queue, reviewed and idempotent DIP updates. | Pending |
| E. Release validation | Synthetic browser acceptance, screenshots, permission and failure tests, and ordered deployment instructions. | Pending |

Production data, real submissions, and deployments are outside this development session.

## Inventory reconciliation

The checked-in workbook export and disposable database each have 39 funder rows. The local master has 12 marked Email without a stored recipient, one marked Portal without a stored endpoint, and 26 with a TBD method. The local submission configuration table initially had no rows. These observations are from repository and local data, not live configuration. Production values should be reviewed in Funder Master. The workflow preserves existing funder UUIDs and associates legacy configuration by its normalized name key. Duplicate keys and unmatched configurations require an administrator to review them. No contacts or guidelines were inferred.
