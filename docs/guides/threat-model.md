## Threat model

This document is a short summary of the assets, the actors who care about them, and what we do to keep the actors honest.

### Assets

* Medication lists tied to a real person
* Adherence history with timestamps
* Caregiver share tokens

### Actors

* The patient using the app on a personal device
* A caregiver with a read only share token
* An attacker on a hostile network
* An attacker who steals a device

### Threats and mitigations

| Threat | Mitigation |
| ------ | ---------- |
| Token theft from local storage | Short lived access tokens, refresh rotation, optional biometric lock |
| Caregiver token sharing beyond intended recipients | Token rotation, scoped permissions, optional expiry |
| Network sniffing | TLS everywhere, HSTS preload |
| SQL injection | Prisma parameterised queries |
| XSS | React escapes by default, CSP set in production |
| Dependency CVEs | Renovate or Dependabot pull requests, weekly CodeQL scan |

### Out of scope

* Endpoint compromise of a fully unlocked device
* Coordinated physical access by a hostile family member, beyond a short PIN
