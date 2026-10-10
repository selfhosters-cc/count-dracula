# Count Dracula

A Halloween trick-or-treater counter: helpers' phones at the door tap each kid in, and a porch-facing TV celebrates every kid live. The night-level terms (Event, Kid, Kid number, Tag, Golden ticket, Join key, …) are defined in the [v1 spec's domain model](.scratch/count-dracula/spec.md#2-domain-model). This file adds the terms for running many households on one deployment.

## Language

**Household**:
One home that signs up and runs its own Halloween nights. It owns its Events, and nothing it owns is visible to another Household unless it chooses to share.
_Avoid_: Account, tenant, user, customer
