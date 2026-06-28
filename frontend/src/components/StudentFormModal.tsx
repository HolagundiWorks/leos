import { useEffect, useState } from 'react';
import {
  Button,
  Checkbox,
  Divider,
  Group,
  Modal,
  Select,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StudentDetail, StudentFormData } from '../api/client';
import { createStudent, updateStudent } from '../api/client';
import { useAuth } from '../stores/auth';

interface Props {
  onClose: () => void;
  initial?: StudentDetail | null;
}

const RELATIONS = ['Father', 'Mother', 'Guardian', 'Grandparent', 'Sibling', 'Other'];

export function StudentFormModal({ onClose, initial }: Props) {
  const token = useAuth((s) => s.token)!;
  const qc = useQueryClient();
  const isEdit = !!initial;

  const [firstName, setFirstName] = useState(initial?.first_name ?? '');
  const [middleName, setMiddleName] = useState(initial?.middle_name ?? '');
  const [lastName, setLastName] = useState(initial?.last_name ?? '');
  const [gender, setGender] = useState<string | null>(initial?.gender ?? null);
  const [birthdate, setBirthdate] = useState(initial?.birthdate ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [altId, setAltId] = useState(initial?.alt_id ?? '');
  const [enrolled, setEnrolled] = useState(initial?.enrolled ?? false);
  const [guardianName, setGuardianName] = useState(initial?.guardian_name ?? '');
  const [guardianPhone, setGuardianPhone] = useState(initial?.guardian_phone ?? '');
  const [guardianRelation, setGuardianRelation] = useState<string | null>(initial?.guardian_relation ?? null);
  const [address, setAddress] = useState(initial?.address ?? '');
  const [fatherName, setFatherName] = useState(initial?.father_name ?? '');
  const [motherName, setMotherName] = useState(initial?.mother_name ?? '');
  const [bloodGroup, setBloodGroup] = useState<string | null>(initial?.blood_group ?? null);
  const [admissionDate, setAdmissionDate] = useState(initial?.admission_date ?? '');
  const [nationality, setNationality] = useState(initial?.nationality ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [emergencyContact, setEmergencyContact] = useState(initial?.emergency_contact ?? '');
  const [medicalNotes, setMedicalNotes] = useState(initial?.medical_notes ?? '');

  useEffect(() => {
    if (initial) {
      setFirstName(initial.first_name ?? '');
      setMiddleName(initial.middle_name ?? '');
      setLastName(initial.last_name ?? '');
      setGender(initial.gender ?? null);
      setBirthdate(initial.birthdate ?? '');
      setEmail(initial.email ?? '');
      setPhone(initial.phone ?? '');
      setAltId(initial.alt_id ?? '');
      setEnrolled(initial.enrolled ?? false);
      setGuardianName(initial.guardian_name ?? '');
      setGuardianPhone(initial.guardian_phone ?? '');
      setGuardianRelation(initial.guardian_relation ?? null);
      setAddress(initial.address ?? '');
      setFatherName(initial.father_name ?? '');
      setMotherName(initial.mother_name ?? '');
      setBloodGroup(initial.blood_group ?? null);
      setAdmissionDate(initial.admission_date ?? '');
      setNationality(initial.nationality ?? '');
      setCategory(initial.category ?? '');
      setEmergencyContact(initial.emergency_contact ?? '');
      setMedicalNotes(initial.medical_notes ?? '');
    }
  }, [initial]);

  const payload = (): StudentFormData => ({
    first_name: firstName,
    middle_name: middleName || undefined,
    last_name: lastName,
    gender: gender || undefined,
    birthdate: birthdate || undefined,
    email: email || undefined,
    phone: phone || undefined,
    alt_id: altId || undefined,
    enrolled,
    guardian_name: guardianName || undefined,
    guardian_phone: guardianPhone || undefined,
    guardian_relation: guardianRelation || undefined,
    address: address || undefined,
    father_name: fatherName || undefined,
    mother_name: motherName || undefined,
    blood_group: bloodGroup || undefined,
    admission_date: admissionDate || undefined,
    nationality: nationality || undefined,
    category: category || undefined,
    emergency_contact: emergencyContact || undefined,
    medical_notes: medicalNotes || undefined,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['students'] });
    if (isEdit && initial) qc.invalidateQueries({ queryKey: ['student', initial.id] });
  };

  const create = useMutation({
    mutationFn: () => createStudent(token, payload()),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const update = useMutation({
    mutationFn: () => updateStudent(token, initial!.id, payload()),
    onSuccess: () => { invalidate(); onClose(); },
  });

  const save = () => (isEdit ? update.mutate() : create.mutate());
  const busy = create.isPending || update.isPending;
  const canSave = firstName.trim() !== '' && lastName.trim() !== '';

  return (
    <Modal
      opened
      onClose={onClose}
      title={isEdit ? `Edit — ${initial?.first_name} ${initial?.last_name}` : 'Admit New Student'}
      centered
      size="lg"
      styles={{ body: { overflowY: 'auto', maxHeight: '75vh' } }}
    >
      <Stack gap="md">
        {/* Name */}
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <TextInput label="First name" placeholder="First" value={firstName} onChange={(e) => setFirstName(e.currentTarget.value)} required data-testid="student-first-name-input" />
          <TextInput label="Middle name" placeholder="Middle" value={middleName} onChange={(e) => setMiddleName(e.currentTarget.value)} data-testid="student-middle-name-input" />
          <TextInput label="Last name" placeholder="Last" value={lastName} onChange={(e) => setLastName(e.currentTarget.value)} required data-testid="student-last-name-input" />
        </SimpleGrid>

        {/* Demographics */}
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <Select
            label="Gender"
            placeholder="Select…"
            data={['Male', 'Female', 'Other']}
            value={gender}
            onChange={setGender}
            clearable
          />
          <TextInput
            type="date"
            label="Date of birth"
            value={birthdate}
            onChange={(e) => setBirthdate(e.currentTarget.value)}
          />
          <TextInput
            label="Admission / Roll No"
            placeholder="ALT-001"
            value={altId}
            onChange={(e) => setAltId(e.currentTarget.value)}
          />
        </SimpleGrid>

        {/* Contact */}
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput label="Email" type="email" placeholder="student@school.edu" value={email} onChange={(e) => setEmail(e.currentTarget.value)} data-testid="student-email-input" />
          <TextInput label="Phone" placeholder="+91 90000 XXXXX" value={phone} onChange={(e) => setPhone(e.currentTarget.value)} data-testid="student-phone-input" />
        </SimpleGrid>

        <Divider label="Guardian" labelPosition="left" />

        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <TextInput label="Guardian name" placeholder="Full name" value={guardianName} onChange={(e) => setGuardianName(e.currentTarget.value)} />
          <TextInput label="Guardian phone" placeholder="+91 90000 XXXXX" value={guardianPhone} onChange={(e) => setGuardianPhone(e.currentTarget.value)} />
          <Select
            label="Relation"
            placeholder="Select…"
            data={RELATIONS}
            value={guardianRelation}
            onChange={setGuardianRelation}
            clearable
          />
        </SimpleGrid>

        <Textarea
          label="Address"
          placeholder="Home address"
          value={address}
          onChange={(e) => setAddress(e.currentTarget.value)}
          autosize
          minRows={2}
        />

        <Divider label="Parents & additional details" labelPosition="left" />
        <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
          <TextInput label="Father's name" value={fatherName} onChange={(e) => setFatherName(e.currentTarget.value)} />
          <TextInput label="Mother's name" value={motherName} onChange={(e) => setMotherName(e.currentTarget.value)} />
          <TextInput label="Emergency contact" placeholder="+91 90000 XXXXX" value={emergencyContact} onChange={(e) => setEmergencyContact(e.currentTarget.value)} />
          <Select label="Blood group" placeholder="Select…" data={['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-']} value={bloodGroup} onChange={setBloodGroup} clearable />
        </SimpleGrid>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
          <TextInput type="date" label="Admission date" value={admissionDate} onChange={(e) => setAdmissionDate(e.currentTarget.value)} />
          <TextInput label="Nationality" placeholder="Indian" value={nationality} onChange={(e) => setNationality(e.currentTarget.value)} />
          <TextInput label="Category" placeholder="General / OBC / SC / ST" value={category} onChange={(e) => setCategory(e.currentTarget.value)} />
        </SimpleGrid>
        <Textarea label="Medical notes" placeholder="Allergies, conditions, medication…" value={medicalNotes} onChange={(e) => setMedicalNotes(e.currentTarget.value)} autosize minRows={2} />

        <Checkbox
          label="Mark as enrolled"
          checked={enrolled}
          onChange={(e) => setEnrolled(e.currentTarget.checked)}
        />

        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" onClick={onClose} data-testid="student-form-cancel-button">Cancel</Button>
          <Button onClick={save} loading={busy} disabled={!canSave} data-testid="student-form-save-button">
            {isEdit ? 'Save changes' : 'Admit student'}
          </Button>
        </Group>

        {(create.isError || update.isError) && (
          <Text size="xs" c="red" ta="center">
            {(create.error as Error)?.message ?? (update.error as Error)?.message ?? 'Save failed'}
          </Text>
        )}
      </Stack>
    </Modal>
  );
}
