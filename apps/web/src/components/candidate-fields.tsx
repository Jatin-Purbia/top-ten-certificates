"use client";
import { useState } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { candidateInputSchema, type CandidateInput, type Candidate } from "@pathey/types";
import { getNameSuggestions } from "@pathey/hindi-text";
import { Field } from "@pathey/ui";

// Shared between the cycle workspace's Add/Edit candidate modals and the
// admin Candidates page's Edit modal, so both ask for exactly the same
// fields with exactly the same behaviour instead of drifting apart.
export const fieldLabels: Record<keyof CandidateInput, string> = {
  participantId: "Serial number / क्रमांक संख्या",
  certificateNumber: "Internal certificate number",
  phone: "Mobile number (used to access the certificate)",
  nameHindi: "Candidate name (Hindi)",
  nameEnglish: "Candidate name (English)",
  guardianName: "Parent/guardian name on certificate",
  className: "Class on certificate",
  age: "Age on certificate",
  city: "City/district (magazine only)",
  address: "Full Address",
  score: "Score on certificate",
  rank: "Rank/position on certificate",
  resultDate: "Date on certificate",
  photoPath: "Photo path",
};

/** Builds a react-hook-form-ready value object from a stored candidate, for `form.reset(...)` when opening an edit modal. */
export function candidateToFormValues(p: Candidate): CandidateInput {
  return {
    participantId: p.participantId,
    certificateNumber: p.certificateNumber,
    phone: p.phone,
    nameHindi: p.nameHindi,
    nameEnglish: p.nameEnglish,
    guardianName: p.guardianName,
    className: p.className,
    age: p.age,
    city: p.city,
    address: p.address,
    score: p.score,
    rank: p.rank,
    resultDate: p.resultDate,
    photoPath: p.photoPath,
  };
}

export function useCandidateForm() {
  return useForm<CandidateInput>({ resolver: zodResolver(candidateInputSchema) });
}

// Hindi name is the only visible name field now — typing Roman letters
// shows a dropdown of alternate Devanagari spellings to pick from, exactly
// like the other Hindi-content fields below. nameEnglish still exists in
// the schema (required — used for admin display and PDF filenames) but has
// no input of its own anymore, so it's kept in sync with whatever's typed
// here rather than left empty, the same fallback already used for
// candidates that never had a separate English name on file.
function NameFields({ form }: { form: UseFormReturn<CandidateInput> }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const hindiValue = form.watch("nameHindi") ?? "";
  const suggestions = getNameSuggestions(hindiValue);

  const setName = (value: string) => {
    form.setValue("nameHindi", value, { shouldValidate: true });
    form.setValue("nameEnglish", value, { shouldValidate: true });
  };

  return (
    <div className="name-hindi-wrap span-full">
      <Field
        label={fieldLabels.nameHindi}
        autoComplete="off"
        {...form.register("nameHindi", {
          onChange: (e) => setName(e.target.value),
          onBlur: () => setDropdownOpen(false),
        })}
        onFocus={() => setDropdownOpen(true)}
        error={form.formState.errors.nameHindi?.message}
      />
      {dropdownOpen && suggestions.length > 0 && (
        <ul className="name-suggestions-dropdown" role="listbox">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                // onMouseDown (not onClick) fires before the input's blur,
                // and preventDefault stops that blur — otherwise the
                // dropdown would close from the blur handler above before
                // the click ever registers.
                onMouseDown={(e) => {
                  e.preventDefault();
                  setName(s);
                  setDropdownOpen(false);
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// For a single Hindi-content field with no separate English counterpart
// (guardian name, city, address) — same suggestion-dropdown mechanic as the
// name field, but the suggestions come from the field's own current text
// instead of a paired English field. Typing digits or text that's already
// Devanagari simply shows no suggestions (see getNameSuggestions), so this
// degrades harmlessly for fields that aren't really "a name".
function HindiSuggestField({
  form,
  name,
  label,
}: {
  form: UseFormReturn<CandidateInput>;
  name: "guardianName" | "address";
  label: string;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const value = form.watch(name) ?? "";
  const suggestions = getNameSuggestions(String(value));
  const pickSuggestion = (suggestion: string) => {
    form.setValue(name, suggestion, { shouldValidate: true });
    setDropdownOpen(false);
  };
  return (
    <div className="name-hindi-wrap">
      <Field
        label={label}
        autoComplete="off"
        {...form.register(name, { onBlur: () => setDropdownOpen(false) })}
        onFocus={() => setDropdownOpen(true)}
        error={form.formState.errors[name]?.message}
      />
      {dropdownOpen && suggestions.length > 0 && (
        <ul className="name-suggestions-dropdown" role="listbox">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickSuggestion(s);
                }}
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Shared by the add and edit forms. Add generates participantId/certificateNumber
// server-side (see store.createCandidate); certificateNumber is never
// user-facing at all (it's used internally for filenames), so only
// participantId ("Serial number") is shown, and only on Edit, where an
// existing candidate already has a real value worth reviewing.
export function CandidateFields({
  form,
  mode,
}: {
  form: UseFormReturn<CandidateInput>;
  mode: "add" | "edit";
}) {
  const textFields: (keyof CandidateInput)[] = [
    ...(mode === "edit" ? (["participantId"] as const) : []),
    "phone",
    "className",
  ];
  return (
    <>
      <NameFields form={form} />
      {textFields.map((k) => (
        <Field
          key={k}
          label={fieldLabels[k]}
          type={k === "phone" ? "tel" : undefined}
          {...form.register(k)}
          error={form.formState.errors[k]?.message}
        />
      ))}
      <HindiSuggestField form={form} name="guardianName" label={fieldLabels.guardianName} />
      <HindiSuggestField form={form} name="address" label={fieldLabels.address} />
      <Field
        label={fieldLabels.age}
        type="number"
        {...form.register("age", { valueAsNumber: true })}
        error={form.formState.errors.age?.message}
      />
      <Field
        label={fieldLabels.score}
        type="number"
        step="0.01"
        {...form.register("score", { valueAsNumber: true })}
        error={form.formState.errors.score?.message}
      />
      <Field
        label={fieldLabels.rank}
        type="text"
        inputMode="numeric"
        {...form.register("rank", { valueAsNumber: true })}
        error={form.formState.errors.rank?.message}
      />
      <Field
        label={fieldLabels.resultDate}
        type="date"
        {...form.register("resultDate")}
        error={form.formState.errors.resultDate?.message}
      />
    </>
  );
}
