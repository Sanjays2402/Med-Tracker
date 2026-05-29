## Data model

Med-Tracker stores six core records:

* **User** identity, locale, and timezone
* **Preferences** per user settings such as theme and quiet hours
* **Medication** a drug instance with strength, form, and supply tracking
* **Schedule** when a medication should be taken
* **Dose** a single scheduled occurrence with status
* **Refill** a prescription fill event used to estimate days of supply
* **CaregiverShare** a signed token granting read only access
* **Notification** queued and delivered alerts

```
User 1 ---* Medication 1 ---* Schedule 1 ---* Dose
                |                |
                |                +---* Refill
                |
                +---* CaregiverShare
```

Cascading deletes remove medications, schedules, doses, refills, and shares when a user closes their account.

See `packages/db/prisma/schema.prisma` for the authoritative definitions.
