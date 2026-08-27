import Head from "next/head";
import Link from "next/link";
import React from "react";
import { prisma } from "../lib/prisma";
import styles from "../styles/Dashboard.module.css";
import PasswordInput from "../components/PasswordInput";
import { checkPasswordStrength } from "../lib/password";

export async function getServerSideProps() {
  const [sports] = await Promise.all([
    prisma.sport.findMany({ where: { status: "active" }, select: { id: true, sportName: true }, orderBy: { sportName: "asc" } }),
  ]);
  return { props: { sports } };
}

export default function CoachRegister({ sports }) {
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [formData, setFormData] = React.useState({
    firstName: "",
    middleName: "",
    lastName: "",
    birthdate: "",
    email: "",
    password: "",
    school: "",
    sportIds: [],
  });
  const [passwordStrength, setPasswordStrength] = React.useState(null);
  const [errors, setErrors] = React.useState({});

  const handleChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (name === "password") {
      const strength = checkPasswordStrength(value);
      setPasswordStrength(strength);
    }
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
  };

  const handleSportChange = (sportId, checked) => {
    setFormData((prev) => ({
      ...prev,
      sportIds: checked
        ? [...prev.sportIds, sportId]
        : prev.sportIds.filter((id) => id !== sportId),
    }));
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.firstName.trim()) newErrors.firstName = "First name is required";
    if (!formData.lastName.trim()) newErrors.lastName = "Last name is required";
    if (!formData.birthdate) newErrors.birthdate = "Birthdate is required";
    if (!formData.email.trim()) newErrors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = "Invalid email format";
    if (!formData.password) newErrors.password = "Password is required";
    else if (formData.password.length < 12) newErrors.password = "Password must be at least 12 characters";
    else if (!passwordStrength?.isValid) newErrors.password = "Password is too weak. Meet at least 3 requirements.";
    if (!formData.school.trim()) newErrors.school = "School name is required";
    if (formData.sportIds.length === 0) newErrors.sports = "Select at least one sport";

    const parsedBirthdate = formData.birthdate && new Date(`${formData.birthdate}T00:00:00Z`);
    const age = parsedBirthdate && Math.floor((Date.now() - parsedBirthdate.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    if (!parsedBirthdate || Number.isNaN(parsedBirthdate.getTime())) newErrors.birthdate = "Invalid birthdate";
    else if (parsedBirthdate > new Date()) newErrors.birthdate = "Birthdate cannot be in the future";
    else if (age < 18) newErrors.birthdate = "You must be at least 18 years old";

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  async function submit(event) {
    event.preventDefault();
    if (!validateForm()) return;
    setBusy(true);
    setMessage("");

    const body = { ...formData, sportIds: formData.sportIds.map(Number) };
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const result = await fetch("/api/coach-register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
      body: JSON.stringify(body),
    }).then((r) => r.json());

    if (result.error) {
      setMessage(result.error);
      if (result.field) setErrors((prev) => ({ ...prev, [result.field]: result.error }));
    } else {
      setMessage(result.message);
      event.currentTarget.reset();
      setFormData({
        firstName: "",
        middleName: "",
        lastName: "",
        birthdate: "",
        email: "",
        password: "",
        school: "",
        sportIds: [],
      });
      setPasswordStrength(null);
    }
    setBusy(false);
  }

  return (
    <>
      <Head>
        <title>Coach registration | Cauayan Athlete Performance</title>
      </Head>
      <main className="login-page">
        <img src="/cauayan logo.png" alt="Cauayan City" className="logo" />
        <p className="auth-kicker">Cauayan City</p>
        <h1>Coach registration</h1>
        <p className="auth-subtitle">Request access to the athlete performance system</p>
        <form onSubmit={submit} noValidate>
          <label>
            First name
            <input
              name="firstName"
              value={formData.firstName}
              onChange={(e) => handleChange("firstName", e.target.value)}
              required
              maxLength="100"
              style={{ borderColor: errors.firstName ? "var(--danger)" : "var(--border)" }}
            />
            {errors.firstName && <span style={{ color: "var(--danger)", fontSize: "12px" }}>{errors.firstName}</span>}
          </label>
          <label>
            Middle name
            <input
              name="middleName"
              value={formData.middleName}
              onChange={(e) => handleChange("middleName", e.target.value)}
              maxLength="100"
            />
          </label>
          <label>
            Last name
            <input
              name="lastName"
              value={formData.lastName}
              onChange={(e) => handleChange("lastName", e.target.value)}
              required
              maxLength="100"
              style={{ borderColor: errors.lastName ? "var(--danger)" : "var(--border)" }}
            />
            {errors.lastName && <span style={{ color: "var(--danger)", fontSize: "12px" }}>{errors.lastName}</span>}
          </label>
          <label>
            Birthdate
            <input
              name="birthdate"
              type="date"
              value={formData.birthdate}
              onChange={(e) => handleChange("birthdate", e.target.value)}
              required
              style={{ borderColor: errors.birthdate ? "var(--danger)" : "var(--border)" }}
            />
            {errors.birthdate && <span style={{ color: "var(--danger)", fontSize: "12px" }}>{errors.birthdate}</span>}
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleChange("email", e.target.value)}
              required
              maxLength="191"
              style={{ borderColor: errors.email ? "var(--danger)" : "var(--border)" }}
            />
            {errors.email && <span style={{ color: "var(--danger)", fontSize: "12px" }}>{errors.email}</span>}
          </label>
          <PasswordInput
            name="password"
            label="Password"
            value={formData.password}
            onChange={handleChange}
            required
            minLength="12"
            maxLength="200"
            autoComplete="new-password"
            showStrength={true}
            placeholder="At least 12 characters"
            error={errors.password}
          />
          <label>
            School
            <input
              name="school"
              value={formData.school}
              onChange={(e) => handleChange("school", e.target.value)}
              required
              maxLength="191"
              placeholder="Enter your school name"
              style={{ borderColor: errors.school ? "var(--danger)" : "var(--border)" }}
            />
            {errors.school && <span style={{ color: "var(--danger)", fontSize: "12px" }}>{errors.school}</span>}
          </label>
          <fieldset style={{ display: "grid", gap: "6px", margin: "4px 0", padding: "10px", border: "1px solid var(--border)", color: "var(--muted)", borderRadius: "8px" }}>
            <legend style={{ fontSize: "13px", fontWeight: 700, marginBottom: "8px" }}>Sports coached</legend>
            {sports.map((sport) => (
              <label key={sport.id} style={{ display: "flex", alignItems: "center", gap: "8px", margin: "6px 0", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  name="sportIds"
                  value={sport.id}
                  checked={formData.sportIds.includes(sport.id)}
                  onChange={(e) => handleSportChange(sport.id, e.target.checked)}
                  style={{ width: "18px", height: "18px", accentColor: "var(--accent)", flexShrink: 0 }}
                />
                <span>{sport.sportName}</span>
              </label>
            ))}
            {errors.sports && <span style={{ color: "var(--danger)", fontSize: "12px", marginTop: "4px" }}>{errors.sports}</span>}
          </fieldset>
          <button disabled={busy} style={{ marginTop: "10px" }}>{busy ? "Submitting..." : "Submit registration"}</button>
          {message && <p role="status" style={{ color: message.startsWith("Registration") ? "var(--accent)" : "var(--danger)", marginTop: "12px", padding: "10px", borderRadius: "6px", background: message.startsWith("Registration") ? "rgba(45,212,168,.16)" : "rgba(248,113,113,.16)", border: message.startsWith("Registration") ? "1px solid var(--accent)" : "1px solid var(--danger)" }}>{message}</p>}
        </form>
        <p><Link href="/login">Back to sign in</Link></p>
      </main>
    </>
  );
}