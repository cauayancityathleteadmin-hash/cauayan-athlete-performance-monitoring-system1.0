import Head from "next/head";
import React from "react";
import { getSession } from "next-auth/react";
import { useRouter } from "next/router";
import styles from "../styles/Dashboard.module.css";
import PasswordInput from "../components/PasswordInput";
import AppShell from "../components/AppShell";
import IdPhotoUpload from "../components/IdPhotoUpload";
import { checkPasswordStrength } from "../lib/password";

export async function getServerSideProps(context) {
  return {
    props: {
      session: { user: { id: 243, name: "Admin", email: "admin@cauayan-test.app", role: "admin", mustChangePassword: false, canApproveCoaches: false }, expires: "2099-01-01T00:00:00.000Z" },
      user: {
        id: 243, name: "Admin User", email: "admin@cauayan-test.app", role: "admin",
        passwordChangedAt: "2026-01-01T00:00:00.000Z", lastLoginAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
        coach: null,
      },
      sports: [{ id: 1, sportName: "Basketball" }],
      probe: context.query.diag || "",
    },
  };
}

class ErrorBarrier extends React.Component {
  state = { error: "" };
  static getDerivedStateFromError(error) {
    return { error: String((error && (error.stack || error.message)) || error) };
  }
  componentDidCatch(error, info) {
    console.error("account boundary caught:", error, info);
  }
  render() {
    if (this.state.error) return <pre data-diag="boundary-error" style={{ padding: 24, whiteSpace: "pre-wrap", color: "#e11d48" }}>{this.state.error}</pre>;
    return this.props.children;
  }
}

export default function Account({ user, sports, session, probe = "" }) {
  const router = useRouter();
  const isCoach = user.role === "coach";
  const diagLevel = probe || "";
  const [tab, setTab] = React.useState("profile");
  const [editing, setEditing] = React.useState(false);
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState("");
  const [passwordData, setPasswordData] = React.useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [newPasswordStrength, setNewPasswordStrength] = React.useState(null);
  const [notifMsg, setNotifMsg] = React.useState({ kind: "", text: "" });
  const [notifySms, setNotifySms] = React.useState(Boolean(coach?.notifySms));
  const [notifyEmail, setNotifyEmail] = React.useState(Boolean(coach?.notifyEmail));
  const [notifBusy, setNotifBusy] = React.useState(false);
  const [dataBusy, setDataBusy] = React.useState("");
  const [dataMsg, setDataMsg] = React.useState({ kind: "", text: "" });
  const [restoreConfirm, setRestoreConfirm] = React.useState("");

  const coach = user.coach;
  const [view, setView] = React.useState({
    firstName: coach?.firstName || "",
    middleName: coach?.middleName || "",
    lastName: coach?.lastName || "",
    email: user.email,
    birthdate: coach?.birthdate?.split("T")[0] || "",
    school: coach?.school?.schoolName || "",
    contactNumber: coach?.contactNumber || "",
    sportIds: coach ? coach.sports.map((cs) => cs.sportId) : [],
  });
  const [pictureUrl, setPictureUrl] = React.useState(coach?.pictureUrl || "");
  const initials = ((coach?.firstName?.[0] || "") + (coach?.lastName?.[0] || "")).toUpperCase() || (user.email ? user.email[0].toUpperCase() : "A");
  const profileName = isCoach ? [view.firstName, view.middleName, view.lastName].filter(Boolean).join(" ") : user.name || user.email;

  function formatBirthdate(value) {
    if (!value) return "—";
    const date = new Date(value.includes("T") ? value : `${value}T00:00:00Z`);
    return isNaN(date) ? value : date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  const handlePasswordChange = (name, value) => {
    setPasswordData((prev) => ({ ...prev, [name]: value }));
    if (name === "newPassword") {
      setNewPasswordStrength(checkPasswordStrength(value));
    }
  };

  function submittedView(form) {
    return {
      firstName: (form.get("firstName") || "").trim(),
      middleName: (form.get("middleName") || "").trim(),
      lastName: (form.get("lastName") || "").trim(),
      email: (form.get("email") || "").trim(),
      birthdate: form.get("birthdate") || "",
      school: (form.get("school") || "").toString().trim(),
      contactNumber: (form.get("contactNumber") || "").toString().trim(),
      sportIds: isCoach ? form.getAll("sportIds").map(Number) : [],
    };
  }

  async function submitProfile(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries(form.entries());
    if (isCoach) body.sportIds = form.getAll("sportIds").map(Number);
    if (isCoach) body.pictureUrl = pictureUrl || null;
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/account/update-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify(body),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) {
        setMessage(result.error || "Failed to update profile.");
        return;
      }
      setView(submittedView(form));
      setEditing(false);
      setMessage(result.message || "Profile updated successfully.");
    } catch (err) {
      setMessage("Unable to reach the server. Please try again later.");
    }
    setBusy(false);
  }

  async function submitPassword(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setMessage("New passwords do not match.");
      setBusy(false);
      return;
    }

    if (!newPasswordStrength?.isValid) {
      setMessage("New password is too weak. Must meet at least 3 requirements.");
      setBusy(false);
      return;
    }

    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/account/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ currentPassword: passwordData.currentPassword, newPassword: passwordData.newPassword }),
      });
      const result = await response.json().catch(() => ({}));
      setMessage(result.error || (response.ok ? "Password updated successfully." : "Password update failed."));
      if (response.ok && !result.error) {
        setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
        setNewPasswordStrength(null);
      }
    } catch (err) {
      setMessage("Unable to reach the server. Please try again later.");
    }
    setBusy(false);
  }

  async function handleDeleteAccount(event) {
    event.preventDefault();
    if (confirmDelete !== "DELETE") {
      setMessage('Type "DELETE" to confirm.');
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData(event.currentTarget);
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/account/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ password: form.get("password"), confirm: form.get("confirm") }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && !result.error) router.push("/login");
      else setMessage(result.error || "Could not delete the account.");
    } catch (err) {
      setMessage("Unable to reach the server. Please try again later.");
    }
    setBusy(false);
  }

  async function saveNotifPrefs(event) {
    event.preventDefault();
    setNotifBusy(true);
    setNotifMsg({ kind: "", text: "" });
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/account/notification-prefs", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ notifySms, notifyEmail }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) setNotifMsg({ kind: "danger", text: result.error || "Could not save notification settings." });
      else setNotifMsg({ kind: "success", text: result.message });
    } catch (err) {
      setNotifMsg({ kind: "danger", text: "Unable to reach the server. Please try again later." });
    }
    setNotifBusy(false);
  }

  async function sendTest(channel) {
    setNotifBusy(true);
    setNotifMsg({ kind: "", text: "" });
    try {
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/notifications/test", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ channels: [channel] }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) {
        setNotifMsg({ kind: "danger", text: result.error || "The test could not be sent." });
      } else {
        const blocked = channel === "sms" ? result.results?.smsSkipped : result.results?.email ? "" : (channel === "email" ? "Email is not configured." : "");
        const delivered = channel === "sms" ? result.results?.sms : result.results?.email;
        if (delivered) setNotifMsg({ kind: "success", text: `Test ${channel.toUpperCase()} sent to you.` });
        else setNotifMsg({ kind: "danger", text: blocked || `Test ${channel.toUpperCase()} could not be sent.` });
      }
    } catch (err) {
      setNotifMsg({ kind: "danger", text: "Unable to reach the server. Please try again later." });
    }
    setNotifBusy(false);
  }

  async function downloadMyData() {
    setDataBusy("download");
    setDataMsg({ kind: "", text: "" });
    try {
      const response = await fetch("/api/coach/data");
      if (!response.ok) throw new Error("Your data could not be exported.");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const disposition = response.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const link = document.createElement("a");
      link.href = url;
      link.download = match ? match[1] : "coach-data.json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setDataMsg({ kind: "success", text: "Your data backup was downloaded. Keep it somewhere safe." });
    } catch (err) {
      setDataMsg({ kind: "danger", text: err.message });
    } finally {
      setDataBusy("");
    }
  }

  async function restoreMyData(event) {
    event.preventDefault();
    if (restoreConfirm !== "RESTORE") {
      setDataMsg({ kind: "danger", text: 'Type "RESTORE" to confirm.' });
      return;
    }
    setDataBusy("restore");
    setDataMsg({ kind: "", text: "" });
    const file = event.currentTarget.file.files[0];
    if (!file) { setDataMsg({ kind: "danger", text: "Choose your data backup file first." }); setDataBusy(""); return; }
    try {
      const snapshot = JSON.parse(await file.text());
      const csrf = await fetch("/api/csrf").then((r) => r.json());
      const response = await fetch("/api/coach/data", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf.token },
        body: JSON.stringify({ snapshot }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.error) {
        setDataMsg({ kind: "danger", text: result.error || "Your data could not be restored." });
      } else {
        setDataMsg({ kind: "success", text: result.message });
        setRestoreConfirm("");
        event.currentTarget.reset();
      }
    } catch (err) {
      setDataMsg({ kind: "danger", text: "The file is not a valid data backup: " + err.message });
    }
    setDataBusy("");
  }

return (
    <ErrorBarrier>
      <Head>
        <title>My Account | Cauayan Athlete Performance</title>
      </Head>
      {diagLevel.includes("shell") ? (
        <AppShell session={session} isAdmin={session?.user?.role === "admin"} eyebrow="Cauayan City" title="My Account" active="/account">
          {diagLevel.includes("header") && (
            <div className={styles.profileHeader}>
              <span className={styles.avatar} style={{ borderRadius: 10 }}>{pictureUrl ? <img src={pictureUrl} alt="ID photo" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 10 }} /> : initials}</span>
              <div className={styles.profileMeta}>
                <h2>{profileName}</h2>
                <small>{user.email} · {user.role}</small>
              </div>
            </div>
          )}
          {diagLevel.includes("tabs") && (
            <div className={styles.tabs}>
              <button type="button" className={`${styles.tabBtn} ${tab === "profile" ? styles.active : ""}`} onClick={() => setTab("profile")}>Profile</button>
              <button type="button" className={`${styles.tabBtn} ${tab === "password" ? styles.active : ""}`} onClick={() => setTab("password")}>Password</button>
              {isCoach && <button type="button" className={`${styles.tabBtn} ${tab === "notifications" ? styles.active : ""}`} onClick={() => setTab("notifications")}>Notifications</button>}
              {isCoach && <button type="button" className={`${styles.tabBtn} ${tab === "data" ? styles.active : ""}`} onClick={() => setTab("data")}>My data</button>}
              <button type="button" className={`${styles.tabBtn} ${styles.dangerTab} ${tab === "delete" ? styles.active : ""}`} onClick={() => setTab("delete")}>Delete Account</button>
            </div>
          )}
          {diagLevel.includes("marker") && <p data-diag="bisect-b" style={{ padding: 24 }}>BISECT-B: end-of-levels. sports0={sports[0]?.sportName} coach={Boolean(user.coach) ? "yes" : "no"} canApprove={String(session?.user?.canApproveCoaches)} profileName={profileName}</p>}
        </AppShell>
      ) : (
        <main>
          <p data-diag="render-none">BASELINE OK role={user.role} sports={sports.length} email={user.email}</p>
        </main>
      )}
    </ErrorBarrier>
  );
}