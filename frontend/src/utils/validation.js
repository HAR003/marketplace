// The same rules as the backend DTOs (backend/src/dtos), checked before sending

const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]+$/
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateRegistration({
  username,
  email,
  password,
  confirmPassword,
}) {
  const errors = {}
  const name = username.trim()

  if (name.length < 3 || name.length > 30) {
    errors.username = 'Use 3 to 30 characters.'
  } else if (!USERNAME_PATTERN.test(name)) {
    errors.username = 'Use only letters, numbers, dots, dashes and underscores.'
  }

  if (!EMAIL_PATTERN.test(email.trim())) {
    errors.email = 'Enter a valid email address.'
  }

  if (password.length < 8) {
    errors.password = 'Use at least 8 characters.'
  } else if (password.length > 72) {
    errors.password = 'Use at most 72 characters.'
  }

  if (confirmPassword !== password) {
    errors.confirmPassword = "Passwords don't match."
  }
  return errors
}

export function validateLogin({ email, password }) {
  const errors = {}
  if (!EMAIL_PATTERN.test(email.trim())) {
    errors.email = 'Enter a valid email address.'
  }
  if (!password) errors.password = 'Enter your password.'
  return errors
}
