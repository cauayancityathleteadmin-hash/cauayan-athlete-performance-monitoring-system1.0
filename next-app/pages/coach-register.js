import Head from "next/head";
import Link from "next/link";
import React from "react";
import { prisma } from "../lib/prisma";
import styles from "../styles/Dashboard.module.css";

export async function getServerSideProps() {
  const [schools, sports] = await Promise.all([
    prisma.school.findMany({ where: { status: "active" }, select: { id: true, schoolName: true }, orderBy: { schoolName: "asc" } }),
    prisma.sport.findMany({ where: { status: "active" }, select: { id: true, sportName: true }, orderBy: { sportName: "asc" } }),
  ]);
  return { props: { schools, sports } };
}

export default function CoachRegister({ schools, sports }) {
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    body.sportIds = form.getAll("sportIds").map(Number);
    const csrf = await fetch("/api/csrf").then((r) => r.json());
    const result = await fetch("/api/coach-register", { method: "POST", headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token }, body: JSON.stringify(body) }).then((r) => r.json());
    setMessage(result.error || result.message); if (!result.error) event.currentTarget.reset(); setBusy(false);
  }
  return <><Head><title>Coach registration | Cauayan Athlete Performance</title></Head><main className="login-page"><p className="auth-kicker">Cauayan City</p><h1>Coach registration</h1><p className="auth-subtitle">Request access to the athlete performance system</p><form onSubmit={submit}><label>First name<input name="firstName" required maxLength="100" /></label><label>Middle name<input name="middleName" maxLength="100" /></label><label>Last name<input name="lastName" required maxLength="100" /></label><label>Birthdate<input name="birthdate" type="date" required /></label><label>Email<input name="email" type="email" required maxLength="191" /></label><label>Password<input name="password" type="password" required minLength="10" maxLength="200" /></label><label>School<select name="schoolId" required><option value="">Select school</option>{schools.map((school) => <option value={school.id} key={school.id}>{school.schoolName}</option>)}</select></label><fieldset><legend>Sports coached</legend>{sports.map((sport) => <label key={sport.id}><input type="checkbox" name="sportIds" value={sport.id} /> {sport.sportName}</label>)}</fieldset><button disabled={busy}>{busy ? "Submitting..." : "Submit registration"}</button>{message && <p role="status">{message}</p>}</form><p><Link href="/login">Back to sign in</Link></p></main></>;
}
