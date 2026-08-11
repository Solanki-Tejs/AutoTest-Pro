/**
 * AutoTest Pro — Auth API helpers
 * Connects to the FastAPI backend at NEXT_PUBLIC_API_URL (default: http://localhost:8000)
 */

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
  role: UserRole
): Promise<RegisterResponse> {
  const res = await fetch(`${BASE_URL}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email, password, role }),
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

// ─── Login ────────────────────────────────────────────────────────────────────

export async function loginUser(
  email: string,
  password: string
): Promise<LoginResponse> {
  // FastAPI OAuth2PasswordRequestForm requires application/x-www-form-urlencoded
  const body = new URLSearchParams({ username: email, password });

  const res = await fetch(`${BASE_URL}/api/auth/login`, {
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
