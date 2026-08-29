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
  const [reviewing, setReviewing] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);
  const [formData, setFormData] = React.useState({
    firstName: "",
    middleName: "",
    lastName: "",
    birthdate: "",
    email: "",
    password: "",
    school: "",
    contactNumber: "",
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
    if (formData.contactNumber && !/^[0-9+\-\s()]{7,30}$/.test(formData.contactNumber.trim())) newErrors.contactNumber = "Enter a valid contact number (7–30 digits). Leave blank if none.";

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
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/coach-register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));

      if (result.error) {
        setMessage(result.error);
        if (result.field) setErrors((prev) => ({ ...prev, [result.field]: result.error }));
      } else if (response.ok && result.success) {
        setMessage(result.message);
        setSubmitted(true);
        setReviewing(false);
        resetForm();
      } else {
        setMessage("Registration could not be completed. Please try again.");
      }
    } catch (err) {
      setMessage("Unable to reach the server. Please try again later.");
    }
    setBusy(false);
  }

  function review(event) {
    event.preventDefault();
    if (!validateForm()) return;
    setMessage("");
    setReviewing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function edit() {
    setReviewing(false);
    setMessage("");
  }

  function resetForm() {
    setFormData({
      firstName: "",
      middleName: "",
      lastName: "",
      birthdate: "",
      email: "",
      password: "",
      school: "",
      contactNumber: "",
      sportIds: [],
    });
    setPasswordStrength(null);
  }

  const sportNameOf = (id) => (sports.find((s) => s.id === id)?.sportName) || null;

  const fullName = [formData.firstName, formData.middleName, formData.lastName].filter(Boolean).join(" ").trim();

  const formattedBirthdate =
    formData.birthdate
      ? new Date(`${formData.birthdate}T00:00:00Z`).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })
      : "";

  const selectedSports = formData.sportIds.map(sportNameOf).filter(Boolean);

  function reviewRow(label, value) {
    return (
      <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", padding: "12px 0", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        <dt style={{ color: "var(--muted)", fontSize: "14px", fontWeight: 600, flex: "0 0 40%" }}>{label}</dt>
        <dd style={{ margin: 0, textAlign: "right", fontSize: "15px", fontWeight: 600, wordBreak: "break-word", flex: "1 1 auto" }}>{value || <span style={{ color: "var(--muted)", fontWeight: 400 }}>—</span>}</dd>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Coach registration | Cauayan Athlete Performance</title>
      </Head>
      <main className="login-page register-box">
        <img src="/cauayan logo.png" alt="Cauayan City" className="logo" />
        <p className="auth-kicker">Cauayan City</p>
        <h1>Coach registration</h1>
        <p className="auth-subtitle">Request access to the athlete performance system</p>

        {reviewing ? (
          <div style={{ width: "100%" }}>
            <section
              style={{
                padding: "20px",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                background: "rgba(6, 38, 30, .5)",
              }}
            >
              <p style={{ color: "var(--accent)", fontWeight: 700, margin: "0 0 14px" }}>Review your registration details</p>
              <p style={{ color: "var(--muted)", fontSize: "14px", margin: "0 0 8px" }}>
                Please double-check that all information below is correct before submitting.
              </p>
              <dl style={{ margin: 0 }}>
                {reviewRow("Full name", fullName)}
                {reviewRow("Birthdate", formattedBirthdate)}
                {reviewRow("Email", formData.email)}
                {reviewRow("School", formData.school)}
                {reviewRow("Contact number", formData.contactNumber)}
                {reviewRow("Sports coached", selectedSports.join(", "))}
              </dl>
            </section>
            <div style={{ display: "flex", gap: "12px", marginTop: "18px", flexWrap: "wrap" }}>
              <button type="button" onClick={edit} disabled={busy} style={{
                flex: "1 1 auto",
                background: "rgba(45,212,168,.16)",
                color: "var(--accent)",
                border: "1px solid var(--border)",
              }}>
                Edit information
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                style={{ flex: "1 1 auto", background: "var(--accent)", color: "#041f18" }}
              >
                {busy ? "Submitting..." : "Confirm & submit registration"}
              </button>
            </div>
            {message && (
              <p
                role="status"
                style={{
                  color: message.startsWith("Registration") ? "var(--accent)" : "var(--danger)",
                  marginTop: "12px",
                  padding: "10px",
                  borderRadius: "6px",
                  background: message.startsWith("Registration") ? "rgba(45,212,168,.16)" : "rgba(248,113,113,.16)",
                  border: message.startsWith("Registration") ? "1px solid var(--accent)" : "1px solid var(--danger)",
                }}
              >
                {message}
              </p>
            )}
          </div>
        ) : (
          <form onSubmit={review} noValidate className="register-fields" style={{ width: "100%" }}>
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
              Contact number <small style={{ color: "var(--muted)", fontWeight: 400 }}>(optional)</small>
              <input
                name="contactNumber"
                type="tel"
                value={formData.contactNumber}
                onChange={(e) => handleChange("contactNumber", e.target.value)}
                maxLength="30"
                placeholder="e.g. 0917 000 0000"
                style={{ borderColor: errors.contactNumber ? "var(--danger)" : "var(--border)" }}
              />
              {errors.contactNumber && <span style={{ color: "var(--danger)", fontSize: "12px" }}>{errors.contactNumber}</span>}
            </label>
            <label className="span-2">
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
            <div className="span-2">
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
            </div>
            <label className="span-2">
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
            <fieldset className="span-2 register-sports">
              <legend>Sports coached</legend>
              <div className="register-sports-grid">
                {sports.map((sport) => {
                  const checked = formData.sportIds.includes(sport.id);
                  return (
                    <label key={sport.id} className={`register-sports-option${checked ? " is-checked" : ""}`}>
                      <input
                        type="checkbox"
                        name="sportIds"
                        value={sport.id}
                        checked={checked}
                        onChange={(e) => handleSportChange(sport.id, e.target.checked)}
                      />
                      <span>{sport.sportName}</span>
                    </label>
                  );
                })}
              </div>
              {errors.sports && <span style={{ color: "var(--danger)", fontSize: "12px", marginTop: "4px", display: "block" }}>{errors.sports}</span>}
            </fieldset>
            <button type="submit" disabled={busy} className="span-2" style={{ marginTop: "10px" }}>
              Review registration
            </button>
          </form>
        )}

        {!reviewing && (
          <p className="auth-register" style={{ margin: "22px 0 0" }}><Link href="/login">Back to sign in</Link></p>
        )}
      </main>
    </>
  );
}