"use client";

import { useRef, useState } from "react";
import type { FormEvent, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Button } from "@/components/ui/button";
import { FormField, fieldErrors } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { CONTACT_TOPICS, MESSAGE_MAX, contactSchema, type ContactInput } from "./contact-schema";

type Invalid = { invalid?: boolean };

function Textarea({ invalid, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & Invalid) {
  return <textarea className="mk-textarea" aria-invalid={invalid || undefined} {...rest} />;
}

function Select({ invalid, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & Invalid) {
  return <select className="mk-select" aria-invalid={invalid || undefined} {...rest} />;
}

const empty: ContactInput = { name: "", email: "", phone: "", topic: "" as ContactInput["topic"], message: "" };
const fieldOrder = ["name", "email", "phone", "topic", "message"] as const;

/**
 * Contact form UI. Validates with Zod in the browser and then stops: there is no backend yet,
 * so nothing is sent, stored or logged. The result message says so plainly.
 */
export function ContactForm() {
  const [values, setValues] = useState<ContactInput>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempted, setAttempted] = useState(false);
  const [checked, setChecked] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  function validate(next: ContactInput) {
    const result = contactSchema.safeParse(next);
    const errs = result.success ? {} : fieldErrors(result.error);
    setErrors(errs);
    return errs;
  }

  function update<K extends keyof ContactInput>(key: K, value: ContactInput[K]) {
    const next = { ...values, [key]: value };
    setValues(next);
    setChecked(false);
    if (attempted) validate(next);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAttempted(true);
    const errs = validate(values);
    const first = fieldOrder.find((f) => errs[f]);
    if (first) {
      setChecked(false);
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    // Deliberately no network call. Sending is not connected until the backend and support owner exist.
    setChecked(true);
    requestAnimationFrame(() => resultRef.current?.focus());
  }

  function onReset() {
    setValues(empty);
    setErrors({});
    setAttempted(false);
    setChecked(false);
  }

  const errorCount = Object.keys(errors).length;

  return (
    <form ref={formRef} className="mk-form" noValidate onSubmit={onSubmit} aria-describedby="contact-status">
      <p id="contact-status" className="notice">
        <strong>Sending is not connected yet.</strong> You can fill in and check this form, but nothing you type is
        sent or saved. Please do not include health details. In an emergency in India, call{" "}
        <a href="tel:112">112</a>.
      </p>

      {attempted && errorCount > 0 ? (
        <p role="alert" className="font-semibold text-[var(--warning)]">
          {errorCount === 1 ? "One field needs attention." : `${errorCount} fields need attention.`}
        </p>
      ) : null}

      <FormField label="Your name" required error={errors.name}>
        <Input
          name="name"
          autoComplete="name"
          value={values.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </FormField>

      <FormField label="Email" hint="Give an email or a mobile number, or both." error={errors.email}>
        <Input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          spellCheck={false}
          value={values.email}
          onChange={(e) => update("email", e.target.value)}
        />
      </FormField>

      <FormField label="Mobile number" hint="10 digits, for example 98765 43210." error={errors.phone}>
        <Input
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          value={values.phone}
          onChange={(e) => update("phone", e.target.value)}
        />
      </FormField>

      <FormField label="What is it about?" required error={errors.topic}>
        <Select
          name="topic"
          value={values.topic}
          onChange={(e) => update("topic", e.target.value as ContactInput["topic"])}
        >
          <option value="" disabled>
            Choose a topic
          </option>
          {CONTACT_TOPICS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </FormField>

      <FormField
        label="Message"
        required
        hint={
          <span className="mk-count" aria-live="off">
            {values.message.length} of {MESSAGE_MAX} characters
          </span>
        }
        error={errors.message}
      >
        <Textarea
          name="message"
          rows={6}
          maxLength={MESSAGE_MAX}
          value={values.message}
          onChange={(e) => update("message", e.target.value)}
        />
      </FormField>

      <div className="actions">
        <Button type="submit">Check message</Button>
        <Button type="button" variant="quiet" onClick={onReset}>
          Clear form
        </Button>
      </div>

      <div aria-live="polite">
        {checked ? (
          <div ref={resultRef} tabIndex={-1} className="mk-result">
            <p className="notice-title">Your message looks complete, but it was not sent.</p>
            <p>
              The contact form is not connected to anyone yet, so nothing has been delivered or stored. Keep a copy if
              you need it. For an emergency in India, call <a href="tel:112">112</a>.
            </p>
          </div>
        ) : null}
      </div>
    </form>
  );
}
