# Patient Management — Stage 3 correction

The correction adds Bangladesh-oriented registration, contact and clinical context to the existing Patient record. It preserves the same doctor relationship, protected routes and database. It does not add appointments, prescriptions, billing, insurance or an EHR workflow.

## Registration policy

New registrations require an English/display patient name, free-text condition, mobile number, gender selection, an existing assigned doctor, and **either a date of birth or an explicitly approximate age**. The name remains Unicode-capable so the field label does not exclude legitimate international names. Gender supports an explicit Unknown option. The mobile may be a patient or caregiver's reachable number; the app does not require the patient to own a phone.

All other fields are optional. Unknown blood group is a valid choice. Emergency contact is optional as a whole; if supplied, its name, relationship and mobile must all be valid. Address division and district are optional as a pair; if supplied, their relationship must match the real geography list. No NID, birth-registration number, religion, insurance or other additional identifier is collected.

This policy applies to new POST requests. Existing records created with only name, condition and doctor remain readable and editable. A PATCH may update a legacy record's condition without requiring new demographics. Optional fields are absent or null when unrecorded, and no migration invents personal information, DOB, allergies or medical history.

## Stored fields and validation

| Field                    | Contract                                                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `name`                   | Required Unicode text, 1–120 characters; UI label Patient name (English)                                                    |
| `nameBangla`             | Optional Unicode text, up to 120; UI uses Bangla language metadata                                                          |
| `dateOfBirth`            | Real `YYYY-MM-DD` date between 1900-01-01 and the current Bangladesh calendar day                                           |
| `approximateAge`         | `{value, unit}`; nonnegative integer with unit `years`, `months` or `days`; bounded to 120 years / 1439 months / 43830 days |
| `gender`                 | `female`, `male`, `non-binary`, `other`, `prefer-not-to-say`, `unknown`                                                     |
| `bloodGroup`             | `A+`, `A-`, `B+`, `B-`, `AB+`, `AB-`, `O+`, `O-`, `Unknown`                                                                 |
| `mobile`                 | Bangladesh mobile or explicitly international number; maximum input length 40                                               |
| `email`                  | Optional validated email, lowercased, up to 254                                                                             |
| `division`, `district`   | Optional valid pair from the shared eight-division, 64-district mapping                                                     |
| `upazila`                | Optional text up to 100; intentionally free text because this project does not ship a complete upazila/thana catalog        |
| `addressLine`            | Optional house/road/village text up to 300                                                                                  |
| `postalCode`             | Optional four-digit Bangladesh postal code                                                                                  |
| `emergencyContact`       | Optional `{name, relationship, mobile, relationshipOther?}`; name up to 120; other details up to 80                         |
| `condition`              | Required free text, 1–160; not an arbitrary diagnosis dropdown                                                              |
| `chiefComplaint`         | Optional multiline text up to 1,000                                                                                         |
| `allergyStatus`          | Optional `unknown`, `none-known`, or `known`                                                                                |
| `allergies`              | Optional multiline text up to 1,000; required when status is `known`, empty otherwise                                       |
| `medicalHistory`         | Optional multiline text up to 2,000                                                                                         |
| `currentMedications`     | Optional multiline text up to 1,000                                                                                         |
| `clinicalNotes`          | Optional multiline text up to 2,000                                                                                         |
| `doctorId`               | Required immutable ObjectId reference to an existing Doctor; supplied through the creation route, never the editable body   |
| `createdAt`, `updatedAt` | Server-managed MongoDB dates, returned as ISO timestamps                                                                    |

Emergency relationships are Parent, Spouse, Child, Sibling, Guardian, Relative and Other. `relationshipOther` is permitted only for Other. Optional strings use null to clear; empty strings are not stored as meaningful entries. Names and short text normalize NFKC and whitespace. Clinical text preserves line breaks while rejecting unsupported control characters. Strict nested schemas reject unexpected keys and objects in scalar fields.

DOB and approximate age are mutually exclusive. The interface calculates age from DOB using the Bangladesh calendar date, displaying months or days for infants. An estimate is shown as “Approximately …” and is never converted into a fabricated birth date. An estimate remains the recorded estimate rather than a continuously aging exact value.

The allergy display distinguishes **Unknown**, **No known allergies**, and **Not recorded**. An empty medical history or medication field does not mean the patient has no illness or takes no medication. Optional absent clinical sections are omitted from the detail page.

### Bangladesh localization

Bangladeshi mobile forms such as `01712345678`, `+8801712345678`, spaced variants and Bangla digits normalize to `+8801712345678`. The interface presents Bangladesh mobile numbers in familiar local form; international values retain their country code. Patient contacts reject malformed or ambiguous short local numbers. Existing Doctor contacts continue supporting legitimate landline and international formats; the extension does not rewrite historical phone data.

Division selection narrows the district list, and changing either resets dependent selections. English display spellings are stored consistently; aliases are not silently guessed. Upazila/thana and detailed address accept actual entered text. The UI uses Bangladesh-oriented examples without inserting fictional production records. Record date displays use day-first English dates (`en-GB`) in `Asia/Dhaka`; list creation-date filters retain their explicitly labeled UTC-day API semantics.

The field choices were informed by the [DGHS MCI patient-create validation documentation](https://en.info.shr.dghs.gov.bd/technical-support/mci-patient-create-validations/), which describes names, DOB, gender, address, mobile and blood group, and a [government referral form](https://file-khulna.portal.gov.bd/uploads/08cf33d2-dadd-4bef-ad2e-0d701e27d105/659/982/5be/6599825be3a39787867759.pdf), which includes identity, address/contact, attendant and history information. The [SKH registration guide](https://appointment.skh.gov.bd/guide) provides mobile-based registration context. The geography mapping follows the [Bangladesh National Portal district directory](https://bangladesh.gov.bd/pages/static-pages/69a55ba386514399668e4e9f). The [BMU onboarding portal](https://onco.bmu.ac.bd/onboarding) was consulted but did not expose a readable field list in the research tool; no specific field policy is attributed to it. These references inform a limited local application policy; this is not a DGHS/BMU integration or a claim of clinical/legal certification.

## REST contract

Every route uses the `/api/v1` prefix, the existing `{data: ...}` envelope, and a verified administrator with completed MFA and an active database-backed session.

| Method and path                                 | Result                                                                                                             |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `POST /doctors/:doctorId/patients`              | 201 `{patient}`; strict registration body described above; assignment derives from the existing doctor in the path |
| `GET /doctors/:doctorId/patients`               | Paginated directory restricted to that existing doctor                                                             |
| `DELETE /doctors/:doctorId/patients/:patientId` | Permanent deletion only when both identifiers match one record                                                     |
| `GET /patients`                                 | Global directory with the filters below                                                                            |
| `GET /patients/:patientId`                      | `{patient}`, including recorded demographic/contact/clinical fields and minimal assigned-doctor projection         |
| `PATCH /patients/:patientId`                    | `{patient}`; nonempty strict subset of supported editable fields; null clears optional fields                      |
| `DELETE /patients/:patientId`                   | Permanent removal from the workspace and the doctor's patient list                                                 |

PATCH groups related fields so a single atomic request has a complete cross-field meaning:

- Send `dateOfBirth` and `approximateAge` together when changing either. Use null for the unused representation.
- Send `division` and `district` together when changing either. Clear both with null.
- Send `allergyStatus` and `allergies` together when changing either. For Unknown or No known allergies, send null for the text.
- An `emergencyContact` update replaces the validated contact object as a unit; null clears it.

The editor sends changed fields only, including the required companion fields for these groups. It does not submit untouched fields from an old snapshot. Same-field or same-group edits still use last-writer semantics; there is no optimistic-version conflict UI.

Example new registration body (illustrative disposable data, not a seed):

```json
{
  "name": "Test Patient",
  "condition": "Follow-up review",
  "mobile": "01712345678",
  "gender": "unknown",
  "approximateAge": { "value": 35, "unit": "years" },
  "bloodGroup": "Unknown"
}
```

The new POST contract intentionally requires contact/demographic information that the original three-field POST did not. Existing stored records and legacy PATCH behavior remain compatible; old clients creating records must supply the new registration minimum. No route or doctor association changed.

DELETE accepts an empty JSON object, requires CSRF, and returns `{deleted:true,id}` only after a real deletion. Missing/already-deleted records and nested parent mismatches return 404; malformed IDs/fields return 422; operator/prototype injection returns 400; authentication/CSRF failures retain 401/403. Detail and mutation query strings are forbidden.

Patient DTOs retain `id`, `name`, `condition`, `doctorId`, `doctor: {id,name,specialization}`, and ISO timestamps, with recorded optional fields added. Internal normalized `nameKey`, `conditionKey`, search tokens and database metadata are excluded. No authentication information is included. Directory responses include only name, condition, age data, gender, mobile, doctor and timestamps; full optional contact/medical details are returned only by protected record/create/update endpoints. Emergency details, allergies, notes, email and address are excluded from list projections.

### Search, filters and pagination

Global list parameters remain `q`, `condition`, `doctorId`, `from`, `to`, `page`, `limit`, `sort`. Nested lists accept the same parameters except `doctorId`; a scope override is rejected. A malformed or missing parent never becomes a global query. A valid nonexistent doctor returns 404.

`q` matches Unicode word prefixes in name and condition, ignoring case; at most five words and 120 characters. Each term must match. Regex syntax is escaped, and punctuation-only queries match nothing. The new personal/clinical text is not indiscriminately included in search. Condition remains an exact normalized case-insensitive filter.

`from` includes UTC midnight; `to` includes the whole UTC day by using the next midnight as the exclusive boundary. Invalid dates and reversed ranges are rejected. `page` defaults to 1, maximum 10,000; `limit` defaults to 10, range 1–50; sort supports newest, oldest, name-asc and name-desc, with a stable `_id` tie break. Pagination returns page, limit, totalItems, totalPages, hasNextPage and hasPreviousPage. Empty results have zero pages. Independent find/count reads are not a transactional snapshot during concurrent changes.

## Persistence and concurrency

The existing Atlas database, environment secrets, doctors, patients, administrator accounts, invitations, sessions and MFA settings are preserved. New model paths are optional with no invented personal defaults. No backfill, replacement database, collection reset or destructive seed is required. Startup retains additive index creation.

The existing indexes remain: `(createdAt desc, _id desc)`, `(nameKey asc, _id asc)`, `(doctorId asc, createdAt desc, _id desc)`, `(conditionKey asc, createdAt desc, _id desc)`, `(doctorId asc, conditionKey asc, createdAt desc, _id desc)`, and multikey `(searchTokens asc)`. No speculative indexes are added for the new fields. Lists use database pagination, a three-second query budget, lean projections and one bounded doctor lookup for the entire page. Prefix filtering may require an additional sort; offset pagination and exact counts require real-workload review before performance claims.

PATCH validates at the route and service boundaries and applies literal field values through a single atomic update pipeline. It recomputes search tokens from the resulting name and condition in the same operation. Disjoint edits preserve each other's supplied fields; related groups are validated and written together. Nested deletion matches both IDs atomically, and repeated/concurrent losers receive 404. A concurrent edit cannot recreate a deleted record. Writes never upsert or automatically replay. Doctor removal is not exposed by the application; external database operators must preserve references.

## Interface and state

The patient editor uses five sections: Personal information, Address, Emergency contact, Medical information and Assigned doctor. Desktop fields form two columns; phones use one. Constrained values use native selects. The doctor picker searches actual stored doctors; no ObjectId entry is shown. A doctor's Add patient action locks assignment automatically. The global form allows a searchable doctor choice. Existing assignment cannot be changed by editing.

The directory includes clickable names, age/gender where recorded, condition, mobile, doctor and record actions. On narrow screens it becomes labeled records. Doctor details have an actual filtered patient count, search, pagination, creation and edit/delete links. Scoped search is stored in `patientQ`; changing it resets `patientPage`. The global directory preserves its own search/filter/sort/page state in the URL.

The patient detail page separates the identity summary and actions from clinical information and the contact/assigned-doctor column. It displays useful missing-data labels instead of empty boxes. The doctor name links to its dedicated profile.

Successful changes refresh the mounted list or navigate to a freshly fetched detail/list with feedback. Doctor-scoped creation returns to the first unfiltered patient page. No patient data is written to localStorage/sessionStorage or a persistent query cache. Duplicate-submit guards, field-error focus, explicit cancel/unload guards and retained values protect in-progress work. Deliberate navigation may still discard a draft. Expired sessions can be restored in a separate tab. Uncertain network outcomes prompt checking the directory before another write. Native delete dialogs start on Cancel, support Escape and explain permanent removal.

## Security and verification

JWT/MFA/session middleware and service-level admin guards cover every patient read and mutation. Strict schemas, validated IDs, escaped queries, unsafe-key rejection, CSRF, exact Origin/CORS and the existing per-admin 100-write-attempts/15-minute budget remain active. Patient POST/PATCH JSON bodies have a bounded 64 KiB limit for multilingual fields; other routes keep 16 KiB. Oversized bodies receive a safe 413 response. React renders clinical text as text, and the nonce CSP remains. Patient information is absent from public landing/auth pages. The additional fields do not enter ordinary application logs or error reports. No authentication tokens enter browser persistent storage.

Backend regression cases cover expanded persistence/validation, phone normalization, real division/district relationships, blood-group and other enumerations, allergy semantics, sparse legacy records, paired atomic edits, assigned-doctor protection, authentication/MFA/CSRF, injection, pagination and deletion. Browser flows cover complete registrations, prefilled editing, DOB-to-estimate changes, optional clearing, real doctor selection, legacy edits, failure/draft recovery, filters, deletion and responsive layouts. Successful browser operations use the real API against disposable test databases; interception is limited to intentional errors/latency. Screenshots contain fictional fixture records. Tests never load the Atlas `.env` connection.

See [Implementation status](IMPLEMENTATION_STATUS.md) for actual executed checks and remaining limitations, and [Design redesign](DESIGN_REDESIGN.md) for the screenshot matrix. Stage 4 adds read-only [dashboard analytics](DASHBOARD_ANALYTICS.md) over the existing references/timestamps without exposing patient details. Deployment remains deferred.
