import React from "react";
import { checkPasswordStrength, getPasswordStrengthColor } from "../lib/password";

export default function PasswordInput({
  name,
  label,
  value,
  onChange,
  required = true,
  minLength = 12,
  maxLength = 200,
  autoComplete = "new-password",
  showStrength = true,
  placeholder = "",
  disabled = false,
  error,
}) {
  const [showPassword, setShowPassword] = React.useState(false);
  const [strength, setStrength] = React.useState(null);

  const handleChange = (e) => {
    const newValue = e.target.value;
    onChange(name, newValue);
    if (showStrength) {
      setStrength(checkPasswordStrength(newValue));
    }
  };

  const toggleVisibility = () => {
    setShowPassword((prev) => !prev);
  };

  return (
    <div style={{ position: "relative" }}>
      <label style={{ color: "var(--muted)", fontSize: "13px", fontWeight: 700, display: "block", marginBottom: "6px" }}>
        {label}
      </label>
      <div style={{ position: "relative" }}>
        <input
          type={showPassword ? "text" : "password"}
          name={name}
          value={value}
          onChange={handleChange}
          required={required}
          minLength={minLength}
          maxLength={maxLength}
          autoComplete={autoComplete}
          disabled={disabled}
          style={{
            width: "100%",
            padding: "14px 16px 14px 50px",
            border: error ? "1px solid var(--danger)" : "1px solid var(--border)",
            borderRadius: "8px",
            background: "rgba(6, 38, 30, .92)",
            color: "var(--foreground)",
            font: "inherit",
            fontSize: "16px",
            transition: "border-color 0.2s, box-shadow 0.2s",
            boxSizing: "border-box",
          }}
          placeholder={placeholder}
          aria-describedby={showStrength ? `${name}-strength` : undefined}
        />
        <button
          type="button"
          onClick={toggleVisibility}
          disabled={disabled}
          style={{
            position: "absolute",
            left: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            background: "transparent",
            border: "none",
            cursor: disabled ? "not-allowed" : "pointer",
            color: disabled ? "var(--muted)" : "var(--foreground)",
            padding: "4px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: disabled ? 0.5 : 1,
          }}
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
        >
          {showPassword ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
              <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          )}
        </button>
      </div>
      {error && (
        <p style={{ color: "var(--danger)", fontSize: "13px", marginTop: "6px" }}>{error}</p>
      )}
      {showStrength && strength && (
        <div id={`${name}-strength`} style={{ marginTop: "10px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
            <span style={{ fontSize: "13px", fontWeight: 600, color: getPasswordStrengthColor(strength.score) }}>
              Password strength: {strength.label}
            </span>
            <div style={{ display: "flex", gap: "4px" }}>
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  style={{
                    width: "100%",
                    height: "4px",
                    borderRadius: "2px",
                    background:
                      i <= strength.score - 1
                        ? getPasswordStrengthColor(strength.score)
                        : "rgba(255,255,255,0.1)",
                    transition: "background 0.3s",
                    flex: 1,
                  }}
                />
              ))}
            </div>
          </div>
          <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "12px", color: "var(--muted)", lineHeight: "1.8" }}>
            {strength.requirements.map((req, i) => (
              <li key={i} style={{ color: req.met ? "var(--accent)" : "var(--muted)" }}>
                {req.label} {req.met ? "✓" : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}