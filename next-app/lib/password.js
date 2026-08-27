export function checkPasswordStrength(password) {
  const checks = {
    length: password.length >= 12,
    uppercase: /[A-Z]/.test(password),
    lowercase: /[a-z]/.test(password),
    number: /[0-9]/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };

  const passedChecks = Object.values(checks).filter(Boolean).length;
  let score = 0;
  let label = "Very Weak";

  if (passedChecks >= 5) {
    score = 4;
    label = "Very Strong";
  } else if (passedChecks === 4) {
    score = 3;
    label = "Strong";
  } else if (passedChecks === 3) {
    score = 2;
    label = "Medium";
  } else if (passedChecks === 2) {
    score = 1;
    label = "Weak";
  } else {
    score = 0;
    label = "Very Weak";
  }

  const requirements = [
    { label: "At least 12 characters", met: checks.length },
    { label: "One uppercase letter", met: checks.uppercase },
    { label: "One lowercase letter", met: checks.lowercase },
    { label: "One number", met: checks.number },
    { label: "One special character", met: checks.special },
  ];

  return {
    score,
    label,
    checks,
    requirements,
    isValid: passedChecks >= 3,
  };
}

export function getPasswordStrengthColor(score) {
  switch (score) {
    case 4: return "var(--accent)";
    case 3: return "#84cc16";
    case 2: return "#fbbf24";
    case 1: return "#fb923c";
    default: return "var(--danger)";
  }
}