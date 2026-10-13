# Sentinel Grid documentation

This site documents the repository as inspected on **11 October 2026**. It is
reverse-engineered from checked-in source, SQL migrations, package manifests,
tests, OpenAPI, and container definitions. It is not an approved customer
contract, release certification, or proof that any specific installation is
running the same revision.

## Find a guide

- [Install and run the local Compose stack](getting-started.md)
- [Requirements reconstructed from the implementation (SRS)](srs.md)
- [System design and Mermaid diagrams (SDD)](sdd.md)
- [Features, conditional behavior, and known gaps](features.md)
- [VMS competitive improvement plan](vms-competitive-roadmap.md)
- [Competitive baseline and test evidence](vms-competitive-baseline.md)
- [VMS engineering progress and release blockers](vms-engineering-progress.md)
- [API contract and its coverage limits](api.md)
- [Database entities and migration process](database.md)
- [Administrator Manual](administrator-manual.md)
- [Developer Manual](developer-manual.md)
- [End-User Manual](end-user-manual.md)
- [Security and configuration](security.md)
- [Operations, backup, and recovery](operations.md)
- [Testing, deployment, and troubleshooting](testing-deployment.md)

## Evidence and status vocabulary

The terms used throughout this site mean:

| Label | Meaning |
|---|---|
| **Implemented in repository** | Source, route registration, schema, or tests exist. This does not establish successful production use. |
| **Conditional** | Behavior depends on secrets, an external service, a model, feature configuration, deployment topology, or compatible hardware. |
| **Partial / unsupported** | The source identifies a TODO, an explicitly unsupported operation, or an incomplete contract. |
| **Unverified** | The repository alone cannot establish runtime configuration, service availability, customer acceptance, or production outcomes. |
| **Planned** | Only used when an authoritative roadmap or explicit planned status exists. A TODO or dormant feature flag is not, by itself, a roadmap commitment. |

The checked-in API contract describes only part of the control plane. The
repository contains many more route modules. See [API documentation](api.md)
before using the OpenAPI file as an exhaustive contract.

## Supported documentation workflow

From the repository root, create an isolated Python environment and install
`docs/requirements.txt`, then run:

```powershell
mkdocs serve -f docs\mkdocs.yml
```

For a static build:

```powershell
mkdocs build -f docs\mkdocs.yml --strict
```

The Mermaid renderer is loaded from a pinned major-version CDN URL; offline
readers can still inspect the Mermaid source blocks in these Markdown files.
