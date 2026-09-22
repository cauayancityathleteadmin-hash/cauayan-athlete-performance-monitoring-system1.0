import React from "react";
import { checkPasswordStrength, getPasswordStrengthColor } from "../lib/password";

export default function PasswordInput({
  id,
  name,
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

  // When used inline (no label prop), render just the input + toggle + strength
  // The parent field-group handles the label
  return (
    <>
      <div style={{ position: "relative" }}>
        <input
          id={id}
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
            height: "48px",
            padding: "0 var(--space-4) 0 calc(var(--space-4) + 50px)",
            border: error ? "1px solid var(--danger)" : "1px solid var(--border)",
            borderRadius: "8px",
            background: "rgba(6, 38, 30, .9)",
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
            right: "8px",
            top: "50%",
            transform: "translateY(-50%)",
            background: "transparent",
            border: "none",
            cursor: disabled ? "not-allowed" : "pointer",
            color: disabled ? "var(--muted)" : "var(--foreground)",
            padding: "6px",
            width: "40px",
            height: "40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: "8px",
            opacity: disabled ? 0.5 : 1,
          }}
          aria-label={showPassword ? "Hide password" : "Show password"}
          aria-pressed={showPassword}
        >
          {showPassword ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
              <circle cx="12" cy="12" r="3"></circle>
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
              <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
          )}
        </button>
      </div>
      {error && (
        <p className="error-text" style={{ color: "var(--danger)", fontSize: "12px", marginTop: "4px" }}>{error}</p>
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
    </>
  );
}