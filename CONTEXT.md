# Glyphkiln domain language

Glyphkiln turns bounded structured design data and explicitly admitted
resources into reproducible graphics while preserving the history needed to
explain and reproduce each output.

## Language

**App Alpha**:
A self-hostable evaluation release for operators who restrict access to trusted
participants; it is not a supported public-internet service.
_Avoid_: Production release, public beta

**Brand kit**:
A named lineage of brand decisions whose history is published as snapshots.
_Avoid_: Mutable brand snapshot

**Brand snapshot**:
An immutable, versioned statement of the brand data used by a design revision.
_Avoid_: Current brand, editable brand version

**Design**:
A named lineage of saved design revisions.
_Avoid_: Design document

**Design revision**:
An immutable saved instance of a validated design document, pinned to the exact
brand snapshot and resource admissions it used.
_Avoid_: Saved draft

**Resource blob**:
Immutable admitted bytes identified by resource kind and content within one
workspace. Several resource admissions may refer to the same resource blob.
_Avoid_: Resource version, upload

**Resource admission**:
An immutable, selectable assertion that specific resource bytes passed
admission with a particular origin, license, scanner receipt, and font face
when applicable.
_Avoid_: Blob, duplicate upload

**Resource ingestion event**:
The append-only record of an accepted upload, including any relationship to an
earlier same-workspace resource admission.
_Avoid_: Resource admission

**Workspace membership**:
The retained relationship between a user and workspace, including its current
role or terminal revocation.
_Avoid_: User account, session

**Render job**:
A durable request to render one exact saved design revision on behalf of the
requesting workspace member.
_Avoid_: Render document, render payload
