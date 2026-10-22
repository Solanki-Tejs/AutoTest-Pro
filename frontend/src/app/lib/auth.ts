import { API_BASE_URL } from "./apiConfig";

export type UserRole = "teacher" | "student" | "admin";

export interface UserResponse {
  id: number;
  name: string;
  email: string;
  role: UserRole;
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: UserResponse;
}

export interface RegisterResponse extends UserResponse {}

// ─── Register ────────────────────────────────────────────────────────────────

export async function registerUser(
  name: string,
  email: string,
  password: string,
  role: UserRole,
  otp?: string
): Promise<RegisterResponse> {
  const res = await fetch(`${API_BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password, role, otp }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 409) throw new Error("An account with this email already exists.");
    if (res.status === 422) {
      const msg = data?.detail?.[0]?.msg ?? "Invalid input. Please check your details.";
      throw new Error(msg);
    }
    throw new Error(data?.detail ?? "Registration failed. Please try again.");
  }

  return res.json();
}

// ─── OTP & Password Management ───────────────────────────────────────────────

export async function sendOtp(email: string, purpose: string): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE_URL}/auth/send-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, purpose }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.detail ?? "Failed to send verification code.");
  }
  return res.json();
}

export async function verifyOtp(email: string, otp: string, purpose: string): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE_URL}/auth/verify-otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp, purpose }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.detail ?? "Invalid verification code.");
  }
  return res.json();
}

export async function forgotPassword(email: string, otp: string, new_password: string): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE_URL}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, otp, new_password }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.detail ?? "Failed to reset password.");
  }
  return res.json();
}

export async function updatePassword(
  token: string,
  payload: { current_password?: string; new_password: string; otp?: string; email?: string }
): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_BASE_URL}/auth/update-password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.detail ?? "Failed to update password.");
  }
  return res.json();
}

// ─── Login ────────────────────────────────────────────────────────────────────

export async function loginUser(
  email: string,
  password: string
): Promise<LoginResponse> {
  // FastAPI OAuth2PasswordRequestForm requires application/x-www-form-urlencoded
  const body = new URLSearchParams({ username: email, password });

  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) throw new Error("Incorrect email or password.");
    throw new Error(data?.detail ?? "Login failed. Please try again.");
  }

  const result: LoginResponse = await res.json();

  // Persist token
  if (typeof window !== "undefined") {
    localStorage.setItem("atp_token", result.access_token);
    localStorage.setItem("atp_user", JSON.stringify(result.user));
  }

  return result;
}

// ─── Session helpers ──────────────────────────────────────────────────────────

export function getStoredUser(): UserResponse | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("atp_user");
    return raw ? (JSON.parse(raw) as UserResponse) : null;
  } catch {
    return null;
  }
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("atp_token");
}

export function logout(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("atp_token");
  localStorage.removeItem("atp_user");
}
