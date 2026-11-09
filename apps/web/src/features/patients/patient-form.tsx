'use client';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  doctorIdSchema,
  patientInputSchema,
  patientUpdateSchema,
  BANGLADESH_DIVISIONS,
  BANGLADESH_DISTRICTS,
  BLOOD_GROUPS,
  PATIENT_GENDERS,
  EMERGENCY_RELATIONSHIPS,
  type Patient,
  type PatientDoctor,
} from '@doctor-tracker/shared';
import { api, ApiError } from '../../lib/api';
import { DoctorPicker } from './components';
import { ageLabel, genderLabels } from './helpers';

function initialValues(patient?: Patient) {
  return {
    name: patient?.name ?? '',
    nameBangla: patient?.nameBangla ?? '',
    condition: patient?.condition ?? '',
    ageMode: patient?.dateOfBirth
      ? 'birth'
      : patient?.approximateAge
        ? 'approximate'
        : patient
          ? ''
          : 'birth',
    dateOfBirth: patient?.dateOfBirth ?? '',
    ageValue: patient?.approximateAge ? String(patient.approximateAge.value) : '',
    ageUnit: patient?.approximateAge?.unit ?? 'years',
    gender: patient?.gender ?? '',
    bloodGroup: patient?.bloodGroup ?? (patient ? '' : 'Unknown'),
    mobile: patient?.mobile ?? '',
    email: patient?.email ?? '',
    division: patient?.division ?? '',
    district: patient?.district ?? '',
    upazila: patient?.upazila ?? '',
    addressLine: patient?.addressLine ?? '',
    postalCode: patient?.postalCode ?? '',
    emergencyName: patient?.emergencyContact?.name ?? '',
    emergencyRelationship: patient?.emergencyContact?.relationship ?? '',
    emergencyMobile: patient?.emergencyContact?.mobile ?? '',
    emergencyOther: patient?.emergencyContact?.relationshipOther ?? '',
    chiefComplaint: patient?.chiefComplaint ?? '',
    allergyStatus: patient?.allergyStatus ?? (patient ? '' : 'unknown'),
    allergies: patient?.allergies ?? '',
    medicalHistory: patient?.medicalHistory ?? '',
    currentMedications: patient?.currentMedications ?? '',
    clinicalNotes: patient?.clinicalNotes ?? '',
  };
}
type Values = ReturnType<typeof initialValues>;
function payload(values: Values) {
  const optional = (value: string) => value.trim() || null;
  return {
    name: values.name,
    condition: values.condition,
    nameBangla: optional(values.nameBangla),
    dateOfBirth: values.ageMode === 'birth' ? optional(values.dateOfBirth) : null,
    approximateAge:
      values.ageMode === 'approximate'
        ? {
            value: values.ageValue === '' ? undefined : Number(values.ageValue),
            unit: values.ageUnit,
          }
        : null,
    gender: optional(values.gender),
    bloodGroup: optional(values.bloodGroup),
    mobile: optional(values.mobile),
    email: optional(values.email),
    division: optional(values.division),
    district: optional(values.district),
    upazila: optional(values.upazila),
    addressLine: optional(values.addressLine),
    postalCode: optional(values.postalCode),
    emergencyContact: [
      values.emergencyName,
      values.emergencyRelationship,
      values.emergencyMobile,
      values.emergencyOther,
    ].some(Boolean)
      ? {
          name: values.emergencyName,
          relationship: values.emergencyRelationship,
          mobile: values.emergencyMobile,
          relationshipOther:
            values.emergencyRelationship === 'Other' ? optional(values.emergencyOther) : null,
        }
      : null,
    chiefComplaint: optional(values.chiefComplaint),
    allergyStatus: optional(values.allergyStatus),
    allergies: values.allergyStatus === 'known' ? optional(values.allergies) : null,
    medicalHistory: optional(values.medicalHistory),
    currentMedications: optional(values.currentMedications),
    clinicalNotes: optional(values.clinicalNotes),
  };
}

export function PatientForm({
  initial,
  doctor,
  back,
}: {
  initial?: Patient;
  doctor?: PatientDoctor;
  back: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState(() => initialValues(initial));
  const [selected, setSelected] = useState(doctor?.id ?? initial?.doctorId ?? '');
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<ApiError>();
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discard, setDiscard] = useState(false);
  const flight = useRef(false);
  const saved = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty && !saved.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function change(key: keyof Values, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }
  function errors(key: string) {
    const grouped: Record<string, string> = {
      emergencyName: 'emergencyContact',
      emergencyMobile: 'emergencyContact',
      emergencyRelationship: 'emergencyContact',
      emergencyOther: 'emergencyContact',
      ageValue: 'approximateAge',
    };
    return fields[key] ?? fields[grouped[key] ?? key.split('.')[0]!];
  }
  function field(
    key: keyof Values,
    label: string,
    options: {
      type?: string;
      required?: boolean;
      max?: number;
      wide?: boolean;
      multiline?: boolean;
      hint?: string;
      lang?: string;
    } = {},
  ) {
    const id = `patient-${key}`;
    const common = {
      id,
      name: key,
      value: values[key],
      onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        change(key, event.target.value),
      maxLength: options.max ?? 160,
      required: options.required,
      'aria-invalid': !!errors(key),
      'aria-describedby': errors(key) ? `${id}-error` : options.hint ? `${id}-hint` : undefined,
      lang: options.lang,
    };
    return (
      <div className={`field${options.wide ? ' patient-field-wide' : ''}`}>
        <label htmlFor={id}>
          {label}
          {options.required && <span aria-hidden="true"> *</span>}
        </label>
        {options.multiline ? (
          <textarea {...common} rows={3} />
        ) : (
          <input {...common} type={options.type ?? 'text'} autoComplete="off" />
        )}
        {options.hint && (
          <p className="field-hint" id={`${id}-hint`}>
            {options.hint}
          </p>
        )}
        {errors(key) && (
          <p className="field-error" id={`${id}-error`} role="alert">
            {errors(key)![0]}
          </p>
        )}
      </div>
    );
  }
  function select(
    key: keyof Values,
    label: string,
    choices: readonly string[],
    options: {
      required?: boolean;
      blank?: string;
      disabled?: boolean;
      labels?: Record<string, string>;
      onChange?: (value: string) => void;
      errorKey?: string;
    } = {},
  ) {
    const id = `patient-${key}`;
    const message = errors(options.errorKey ?? key);
    return (
      <div className="field">
        <label htmlFor={id}>
          {label}
          {options.required && <span aria-hidden="true"> *</span>}
        </label>
        <select
          id={id}
          name={key}
          value={values[key]}
          required={options.required}
          disabled={options.disabled}
          onChange={(event) =>
            options.onChange
              ? options.onChange(event.target.value)
              : change(key, event.target.value)
          }
          aria-invalid={!!message}
          aria-describedby={message ? `${id}-error` : undefined}
        >
          {options.blank !== undefined && <option value="">{options.blank}</option>}
          {choices.map((value) => (
            <option key={value} value={value}>
              {options.labels?.[value] ?? value}
            </option>
          ))}
        </select>
        {message && (
          <p className="field-error" id={`${id}-error`} role="alert">
            {message[0]}
          </p>
        )}
      </div>
    );
  }
  function section(title: string, children: ReactNode, extra?: string) {
    return (
      <fieldset className="patient-form-section" disabled={busy}>
        <legend>{title}</legend>
        {extra && <p className="patient-section-note">{extra}</p>}
        <div className="patient-field-grid">{children}</div>
      </fieldset>
    );
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (flight.current) return;
    setError(undefined);
    const all = payload(values);
    let input: Record<string, unknown> = all;
    if (initial) {
      const previous = payload(initialValues(initial));
      input = Object.fromEntries(
        Object.entries(all).filter(
          ([key, value]) =>
            JSON.stringify(value) !== JSON.stringify(previous[key as keyof typeof previous]),
        ),
      );
      for (const group of [
        ['dateOfBirth', 'approximateAge'],
        ['division', 'district'],
        ['allergyStatus', 'allergies'],
      ]) {
        if (group.some((key) => key in input))
          for (const key of group) input[key] = all[key as keyof typeof all];
      }
      if (Object.keys(input).length === 0) {
        setError(new ApiError(422, 'NO_CHANGES', 'No changes to save.'));
        return;
      }
    }
    const parsed = (initial ? patientUpdateSchema : patientInputSchema).safeParse(input);
    const invalid: Record<string, string[]> = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || 'form';
        (invalid[key] ??= []).push(issue.message);
      }
    if (!doctorIdSchema.safeParse(selected).success)
      invalid.doctorId = ['Select an existing doctor.'];
    if (invalid.approximateAge || invalid['approximateAge.value'])
      invalid.ageValue = invalid['approximateAge.value'] ?? invalid.approximateAge!;
    if (invalid.dateOfBirth && values.ageMode !== 'birth') invalid.ageMode = invalid.dateOfBirth;
    if (invalid.emergencyContact) invalid.emergencyName = invalid.emergencyContact;
    for (const [nested, flat] of [
      ['name', 'emergencyName'],
      ['mobile', 'emergencyMobile'],
      ['relationship', 'emergencyRelationship'],
      ['relationshipOther', 'emergencyOther'],
    ]) {
      if (invalid[`emergencyContact.${nested}`])
        invalid[flat!] = invalid[`emergencyContact.${nested}`]!;
    }
    setFields(invalid);
    if (Object.keys(invalid).length) {
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
      );
      return;
    }
    flight.current = true;
    setBusy(true);
    try {
      await api.get('/auth/me');
      const result = initial
        ? await api.patch<{ patient: Patient }>(`/patients/${initial.id}`, parsed.data!)
        : await api.post<{ patient: Patient }>(`/doctors/${selected}/patients`, parsed.data!);
      saved.current = true;
      if (initial)
        router.push(`/patients/${result.patient.id}?returnTo=${encodeURIComponent(back)}&saved=1`);
      else if (doctor) {
        const destination = new URL(back, window.location.origin);
        destination.searchParams.delete('patientPage');
        destination.searchParams.delete('patientQ');
        destination.searchParams.set('patientCreated', '1');
        router.push(destination.pathname + destination.search);
      } else
        router.push(
          `/patients/${result.patient.id}?returnTo=${encodeURIComponent(back)}&created=1`,
        );
      router.refresh();
    } catch (err) {
      const failure =
        err instanceof ApiError ? err : new ApiError(0, 'CONNECTION_ERROR', 'Unable to save.');
      setError(failure);
      setFields(failure.fields ?? {});
      requestAnimationFrame(() =>
        form.current?.querySelector<HTMLElement>('[role="alert"]')?.focus(),
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  const districts: readonly string[] =
    BANGLADESH_DISTRICTS[values.division as keyof typeof BANGLADESH_DISTRICTS] ?? [];
  const calculatedAge =
    values.ageMode === 'birth' && values.dateOfBirth
      ? ageLabel({ dateOfBirth: values.dateOfBirth })
      : '';
  return (
    <form
      className="patient-form"
      ref={form}
      noValidate
      onSubmit={submit}
      onChange={() => setDirty(true)}
    >
      <p className="patient-required-note">
        * Required{initial ? ' · Unrecorded information may be left blank.' : ''}
      </p>
      {section(
        'Personal information',
        <>
          {field('name', 'Patient name (English)', { required: true, max: 120 })}
          {field('nameBangla', 'Patient name (Bangla)', { max: 120, lang: 'bn' })}
          {select('ageMode', 'Birth date or age', ['birth', 'approximate'], {
            required: !initial,
            blank: initial ? 'Not recorded' : undefined,
            labels: { birth: 'Date of birth known', approximate: 'Approximate age' },
            onChange: (value) => {
              change('ageMode', value);
            },
          })}
          {values.ageMode === 'birth' && (
            <div className="field">
              <label htmlFor="patient-dateOfBirth">
                Date of birth{!initial && <span aria-hidden="true"> *</span>}
              </label>
              <input
                id="patient-dateOfBirth"
                name="dateOfBirth"
                type="date"
                value={values.dateOfBirth}
                max={new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString().slice(0, 10)}
                onChange={(event) => change('dateOfBirth', event.target.value)}
                aria-invalid={!!errors('dateOfBirth')}
                aria-describedby={
                  errors('dateOfBirth') ? 'patient-dateOfBirth-error' : 'patient-calculated-age'
                }
              />
              {errors('dateOfBirth') && (
                <p className="field-error" id="patient-dateOfBirth-error" role="alert">
                  {errors('dateOfBirth')![0]}
                </p>
              )}
              <p className="field-hint" id="patient-calculated-age" aria-live="polite">
                {calculatedAge
                  ? `Age: ${calculatedAge}`
                  : 'Use approximate age if the date is unknown.'}
              </p>
            </div>
          )}
          {values.ageMode === 'approximate' && (
            <div className="field">
              <label htmlFor="patient-ageValue">
                Approximate age{!initial && <span aria-hidden="true"> *</span>}
              </label>
              <div className="patient-age-input">
                <input
                  id="patient-ageValue"
                  name="ageValue"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={values.ageValue}
                  onChange={(event) => change('ageValue', event.target.value)}
                  aria-invalid={!!errors('ageValue')}
                  aria-describedby={
                    errors('ageValue') ? 'patient-ageValue-error' : 'patient-age-hint'
                  }
                />
                <select
                  aria-label="Age unit"
                  value={values.ageUnit}
                  onChange={(event) => change('ageUnit', event.target.value)}
                >
                  <option value="years">Years</option>
                  <option value="months">Months</option>
                  <option value="days">Days</option>
                </select>
              </div>
              <p className="field-hint" id="patient-age-hint">
                Stored as an estimate, without a birth date.
              </p>
              {errors('ageValue') && (
                <p className="field-error" id="patient-ageValue-error" role="alert">
                  {errors('ageValue')![0]}
                </p>
              )}
            </div>
          )}
          {select('gender', 'Gender', PATIENT_GENDERS, {
            required: !initial,
            blank: initial ? 'Not recorded' : 'Select gender',
            labels: genderLabels,
          })}
          {select('bloodGroup', 'Blood group', BLOOD_GROUPS, {
            blank: initial ? 'Not recorded' : undefined,
          })}
          {field('mobile', 'Mobile number', {
            type: 'tel',
            required: !initial,
            max: 40,
            hint: 'Bangladesh: 01712345678 or +8801712345678. International numbers need a country code.',
          })}
          {field('email', 'Email', { type: 'email', max: 254 })}
        </>,
      )}
      {section(
        'Address',
        <>
          {select('division', 'Division', BANGLADESH_DIVISIONS, {
            blank: 'Select division',
            onChange: (value) => {
              setValues((current) => ({ ...current, division: value, district: '', upazila: '' }));
              setDirty(true);
            },
          })}
          {select('district', 'District', districts, {
            blank: 'Select district',
            disabled: !values.division,
            onChange: (value) => {
              setValues((current) => ({ ...current, district: value, upazila: '' }));
              setDirty(true);
            },
          })}
          {field('upazila', 'Upazila / Thana', { max: 100 })}
          {field('postalCode', 'Postal code', { max: 4 })}
          {field('addressLine', 'House / Road / Village', { max: 300, wide: true })}
        </>,
      )}
      {section(
        'Emergency contact',
        <>
          {field('emergencyName', 'Contact name', { max: 120 })}
          {select('emergencyRelationship', 'Relationship', EMERGENCY_RELATIONSHIPS, {
            blank: 'Select relationship',
            onChange: (value) => {
              setValues((current) => ({
                ...current,
                emergencyRelationship: value,
                emergencyOther: value === 'Other' ? current.emergencyOther : '',
              }));
              setDirty(true);
            },
          })}
          {field('emergencyMobile', 'Emergency mobile number', { type: 'tel', max: 40 })}
          {values.emergencyRelationship === 'Other' &&
            field('emergencyOther', 'Relationship details', { max: 80 })}
        </>,
        'Optional. If provided, enter a name, relationship and mobile number.',
      )}
      {section(
        'Medical information',
        <>
          {field('condition', 'Condition', { required: true, max: 160, wide: true })}
          {field('chiefComplaint', 'Symptoms / chief complaint', {
            multiline: true,
            max: 1000,
            wide: true,
          })}
          {select('allergyStatus', 'Allergy status', ['unknown', 'none-known', 'known'], {
            blank: initial ? 'Not recorded' : undefined,
            labels: {
              unknown: 'Unknown',
              'none-known': 'No known allergies',
              known: 'Known allergies',
            },
            onChange: (value) => {
              setValues((current) => ({
                ...current,
                allergyStatus: value,
                allergies: value === 'known' ? current.allergies : '',
              }));
              setDirty(true);
            },
          })}
          {values.allergyStatus === 'known' &&
            field('allergies', 'Known allergies', { max: 1000, multiline: true, required: true })}
          {field('medicalHistory', 'Medical history', { multiline: true, max: 2000 })}
          {field('currentMedications', 'Current medications', { multiline: true, max: 1000 })}
          {field('clinicalNotes', 'Additional notes', { multiline: true, max: 2000, wide: true })}
        </>,
      )}
      {section(
        'Assigned doctor',
        initial || doctor ? (
          <div className="patient-assignment patient-field-wide">
            <strong>{initial?.doctor.name ?? doctor?.name}</strong>
            <span>{initial?.doctor.specialization ?? doctor?.specialization}</span>
            <p className="field-hint">The assigned doctor cannot be changed.</p>
          </div>
        ) : (
          <div
            className="patient-field-wide"
            aria-invalid={!!fields.doctorId}
            tabIndex={fields.doctorId ? -1 : undefined}
          >
            <DoctorPicker
              value={selected}
              onChange={(id) => {
                setSelected(id);
                setDirty(true);
              }}
            />
            {fields.doctorId && (
              <p className="field-error" role="alert">
                {fields.doctorId[0]}
              </p>
            )}
          </div>
        ),
      )}
      {fields.form && (
        <p className="form-error" role="alert">
          {fields.form[0]}
        </p>
      )}
      {error && (
        <div className="form-error" role="alert" tabIndex={-1}>
          <p>{error.message}</p>
          <p>Your entries have been kept.</p>
          {error.status === 401 && (
            <Link className="text-link" href="/login" target="_blank" rel="noopener noreferrer">
              Log in in a new tab, then return to this form
            </Link>
          )}
          {error.status === 0 && (
            <p>
              The result is uncertain. Check the{' '}
              <Link
                className="text-link"
                href="/patients?sort=newest"
                target="_blank"
                rel="noopener noreferrer"
              >
                patient directory
              </Link>{' '}
              before submitting again.
            </p>
          )}
        </div>
      )}
      <div className="doctor-form-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={busy}
          onClick={() => (dirty ? setDiscard(true) : router.push(back))}
        >
          Cancel
        </button>
        <button className="button" disabled={busy} type="submit">
          {busy ? 'Saving patient...' : 'Save patient'}
        </button>
      </div>
      {discard && (
        <div className="discard-confirmation" role="alert">
          <p>Discard unsaved patient details?</p>
          <button type="button" className="secondary-button" onClick={() => setDiscard(false)}>
            Keep editing
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              saved.current = true;
              router.push(back);
            }}
          >
            Discard and leave
          </button>
        </div>
      )}
    </form>
  );
}
