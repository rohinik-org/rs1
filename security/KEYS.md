# Rohinik Release Signing Keys

## Active Keys

| Key ID | File | Purpose | Status |
|--------|------|---------|--------|
| `5bbeedadbddadc71` | `security/beta-signing.pub` | Beta release signing (production) | **ACTIVE** |
| `e0a3ebbcbc75c92c` | `security/dry-run-signing.pub` | CI dry-run rehearsal (test only) | **ACTIVE** |

## Superseded Keys

| Key ID | Superseded | Reason |
|--------|------------|--------|
| `e7d24bfc0d0d3b69` | 2026-08-12 | Private key lost; new keypair generated |
| `67d7b40b619a238e` | 2026-08-12 | Private key lost; new keypair generated |

## Notes

- Production private key (`5bbeedadbddadc71`) stored only in GitHub environment secret `ROHINIK_SIGN_KEY` on `npm-publish` environment in `rohinik-org/rs1`. Never committed.
- Dry-run private key (`e0a3ebbcbc75c92c`) stored only in GitHub repository secret `ROHINIK_SIGN_KEY_TEST` in `rohinik-org/rs1`. Never committed.
- Key IDs are the first 16 hex characters of SHA-256 of the SPKI DER-encoded public key.
- Both public keys are committed to `trusted-keys.ts` in `rohinik-org/sdk`.
