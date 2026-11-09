# Stage 3 correction: light interface and Bangladesh registration

The owner rejected the previous rust actions, graphite sidebar, repetitive headings and lightly restyled administrative pages. The correction changes composition and task hierarchy as well as color. The existing Next.js/Express architecture, authentication, doctor routes, patient relationships and original logo geometry remain.

This records the Stage 3 correction. The dashboard task links described below have since been replaced by the Stage 4 [analytics dashboard](DASHBOARD_ANALYTICS.md), using the same light palette and typography. Current screenshot captures reflect that later dashboard implementation.

## Audit and direction

The rejected Stage 3 screenshots are preserved in `screenshots/before-correction/`: [landing](screenshots/before-correction/landing-desktop.png), [login](screenshots/before-correction/login-desktop.png), [dashboard](screenshots/before-correction/workspace-desktop.png), [doctor directory](screenshots/before-correction/doctors-desktop.png), [doctor profile](screenshots/before-correction/doctor-detail-desktop.png), [patient creation](screenshots/before-correction/patient-create-desktop.png), [mobile doctors](screenshots/before-correction/doctors-mobile.png), and [mobile patient form](screenshots/before-correction/patient-create-mobile.png). The older `screenshots/before/` folder is the Stage 2 baseline, not the correction baseline.

The selected direction is a bright hospital records application: white navigation, quiet blue selection, open page headings, readable records and forms grouped by the registration task. No dark navigation, rust theme, gradients, decorative metrics, stock imagery or promotional panels are used.

Meaningful composition changes:

- Landing: one centered identity, one sentence and one Log in action, with invitation navigation in the header. Both feature-marketing sections and the oversized two-line slogan are removed.
- Authentication: centered white form area, short task copy, consistent labels and inputs. Invitation-only signup, real MFA setup/challenge/recovery and session behavior remain.
- Navigation: white sidebar with three destinations and account/logout, sky-blue active state, and a keyboard-contained mobile menu. The redundant workspace breadcrumb bar and administrative footer are removed.
- Dashboard: direct browse/add actions for Doctors and Patients. No analytics placeholder or fabricated measurements.
- Doctor directory: five clear columns (Doctor, Specialization, Hospital, Phone, Email), an obvious linked name, compact filter area and responsive labeled records.
- Doctor detail: one profile heading, specialization/hospital line, direct phone/email contact, date added, then the actual patient search/list and add/edit/delete actions. Repeated specialization fields and a separate generic practice-details box are removed.
- Patient creation/editing: grouped Personal information, Address, Emergency contact, Medical information and Assigned doctor sections. Two columns on wide forms become one on phones. Native selects constrain real choices; diagnosis remains free text.
- Patient detail: identity and actions at the top, clinical information in the main column and contact/emergency/doctor information beside it. Missing optional sections do not create empty boxes. Unknown allergies, no known allergies and unrecorded information have distinct meanings.

## Tokens and localization

| Role                | Value                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------- |
| Page background     | `#F7FAFD`                                                                              |
| Surface             | `#FFFFFF`                                                                              |
| Quiet blue          | `#EAF5FD`                                                                              |
| Primary control     | `#1979B3` (slightly darker than the proposed `#298BC6` for readable white button text) |
| Hover / linked text | `#176B9F`                                                                              |
| Main text           | `#213547`                                                                              |
| Secondary text      | `#627587`                                                                              |
| Border              | `#D9E6EF`                                                                              |
| Input boundary      | `#7F94A4`, strengthened for contrast against white and the page background             |
| Table headings      | `#4E6475` on `#EDF4FA`                                                                 |
| Destructive control | `#AE2C3C`, separate from the primary theme                                             |

Body/inputs use 16px; form labels 15px; tables 15px; supporting text 14px; page headings 34px desktop/28px mobile. DM Sans and Manrope remain self-hosted. [Noto Sans Bengali](https://github.com/google/fonts/tree/main/ofl/notosansbengali) supplies Bengali glyphs locally under the included SIL Open Font License. Ordinary surfaces have 8-10px corners and no shadows; the delete dialog uses elevation only to establish its modal layer. Spacing follows an 8px rhythm with smaller 4px steps where useful.

Bangladesh mobile values normalize to a canonical country-code form and display locally. Real eight-division/64-district options are validated server-side, district choices follow division, and changing location clears dependent controls. Upazila/thana is free text rather than an incomplete invented lookup. Dates use day-first English formatting in Asia/Dhaka; existing filter boundaries remain explicitly labeled UTC calendar days. DOB never comes from an approximate age. Blood group has all eight ABO/Rh choices plus Unknown. NID, religion and unrelated workflows are not collected. See [Patient Management](PATIENT_MANAGEMENT.md) for the exact policy and research references.

## Design references actually inspected

The [OpenDesign skills catalog](https://open-design.ai/skills/) and the requested upstream instructions were reviewed as references, without installing a design dependency or replacing the CSS stack:

- [Redesign existing projects](https://raw.githubusercontent.com/Leonxlnx/taste-skill/ccbc156/skills/redesign-skill/SKILL.md): inspect existing code and screens, identify concrete issues, then verify changes. The catalog-pinned revision was used because its main-branch path had moved.
- [Design taste frontend](https://github.com/Leonxlnx/taste-skill/blob/main/skills/taste-skill/SKILL.md): deliberate hierarchy, density, responsive composition and consistent controls.
- [Impeccable](https://raw.githubusercontent.com/pbakaus/impeccable/main/plugin/skills/impeccable/SKILL.md): restraint for working interfaces and audit/fix/review of real states.

The owner's explicit light healthcare direction takes precedence over reference suggestions for dramatic typography, dark themes, imagery or effects. The Sites skill was used in local-only mode; no Site registration, framework migration or deployment was performed.

## Screenshot evidence

Final captures come from the actual application using only disposable fictional records. MFA setup keys are masked. The capture helper clears transient focus and scrolls to the top; it does not conceal product defects. The full-page registration screenshots intentionally include all sections.

| Page                      | 1440px                                         | 1024px                                        | 768px                                         | 375px                                         | 320px                                               |
| ------------------------- | ---------------------------------------------- | --------------------------------------------- | --------------------------------------------- | --------------------------------------------- | --------------------------------------------------- |
| Landing                   | [View](screenshots/landing-desktop.png)        | [View](screenshots/landing-laptop.png)        | [View](screenshots/landing-tablet.png)        | [View](screenshots/landing-mobile.png)        | [View](screenshots/landing-small-mobile.png)        |
| Login                     | [View](screenshots/login-desktop.png)          | [View](screenshots/login-laptop.png)          | [View](screenshots/login-tablet.png)          | [View](screenshots/login-mobile.png)          | [View](screenshots/login-small-mobile.png)          |
| Signup                    | [View](screenshots/signup-desktop.png)         | [View](screenshots/signup-laptop.png)         | [View](screenshots/signup-tablet.png)         | [View](screenshots/signup-mobile.png)         | [View](screenshots/signup-small-mobile.png)         |
| MFA setup                 | [View](screenshots/mfa-desktop.png)            | [View](screenshots/mfa-laptop.png)            | [View](screenshots/mfa-tablet.png)            | [View](screenshots/mfa-mobile.png)            | [View](screenshots/mfa-small-mobile.png)            |
| MFA challenge             | [View](screenshots/mfa-challenge-desktop.png)  | [View](screenshots/mfa-challenge-laptop.png)  | [View](screenshots/mfa-challenge-tablet.png)  | [View](screenshots/mfa-challenge-mobile.png)  | [View](screenshots/mfa-challenge-small-mobile.png)  |
| Dashboard                 | [View](screenshots/workspace-desktop.png)      | [View](screenshots/workspace-laptop.png)      | [View](screenshots/workspace-tablet.png)      | [View](screenshots/workspace-mobile.png)      | [View](screenshots/workspace-small-mobile.png)      |
| Doctors                   | [View](screenshots/doctors-desktop.png)        | [View](screenshots/doctors-laptop.png)        | [View](screenshots/doctors-tablet.png)        | [View](screenshots/doctors-mobile.png)        | [View](screenshots/doctors-small-mobile.png)        |
| Add doctor                | [View](screenshots/doctor-create-desktop.png)  | [View](screenshots/doctor-create-laptop.png)  | [View](screenshots/doctor-create-tablet.png)  | [View](screenshots/doctor-create-mobile.png)  | [View](screenshots/doctor-create-small-mobile.png)  |
| Doctor details / patients | [View](screenshots/doctor-detail-desktop.png)  | [View](screenshots/doctor-detail-laptop.png)  | [View](screenshots/doctor-detail-tablet.png)  | [View](screenshots/doctor-detail-mobile.png)  | [View](screenshots/doctor-detail-small-mobile.png)  |
| Patients                  | [View](screenshots/patients-desktop.png)       | [View](screenshots/patients-laptop.png)       | [View](screenshots/patients-tablet.png)       | [View](screenshots/patients-mobile.png)       | [View](screenshots/patients-small-mobile.png)       |
| Add patient               | [View](screenshots/patient-create-desktop.png) | [View](screenshots/patient-create-laptop.png) | [View](screenshots/patient-create-tablet.png) | [View](screenshots/patient-create-mobile.png) | [View](screenshots/patient-create-small-mobile.png) |
| Patient details           | [View](screenshots/patient-detail-desktop.png) | [View](screenshots/patient-detail-laptop.png) | [View](screenshots/patient-detail-tablet.png) | [View](screenshots/patient-detail-mobile.png) | [View](screenshots/patient-detail-small-mobile.png) |
| Edit patient              | [View](screenshots/patient-edit-desktop.png)   | [View](screenshots/patient-edit-laptop.png)   | [View](screenshots/patient-edit-tablet.png)   | [View](screenshots/patient-edit-mobile.png)   | [View](screenshots/patient-edit-small-mobile.png)   |

## Review record

The first rendered desktop review confirmed the new page hierarchy and identified insufficient contrast in the tinted table headings; heading text was darkened. Input boundaries were strengthened, and final phone review moved directory filters to one column through 480px to give native date controls and their labels enough room. Doctor mobile values and day-first date displays were aligned with Bangladesh conventions. Directory payloads were narrowed so clinical notes and emergency/address fields are loaded only on protected record views. Final responsive review and execution counts are recorded in [Implementation status](IMPLEMENTATION_STATUS.md).

Checks cover visual hierarchy, field grouping, native selections, long values, links, keyboard focus, mobile navigation, confirmation dialogs, no unintended horizontal scroll and axe WCAG A/AA-tag rules. Chromium/axe results do not constitute physical-device coverage or a complete accessibility certification. Analytics, production performance measurements and deployment remain outside this correction.
